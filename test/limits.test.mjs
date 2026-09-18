import test from 'node:test';
import assert from 'node:assert/strict';
import { runImportJSON } from '../src/apps-script.mjs';
import { jsonTextToTable } from '../src/core.mjs';
import { LIMITS } from '../src/limits.mjs';

function table(document, options) {
  return jsonTextToTable(JSON.stringify(document), options);
}

function nestedObject(depth) {
  let value = 0;
  for (let index = 0; index < depth; index++) value = { child: value };
  return value;
}

function withFetchBody(body, callback) {
  const previousUrlFetchApp = globalThis.UrlFetchApp;
  const previousCacheService = globalThis.CacheService;

  globalThis.CacheService = {
    getScriptCache() {
      throw new Error('cache disabled for resource-limit test');
    },
  };

  globalThis.UrlFetchApp = {
    fetch() {
      return {
        getResponseCode() { return 200; },
        getContentText() { return body; },
        getAllHeaders() { return {}; },
      };
    },
  };

  try {
    return callback();
  } finally {
    if (previousUrlFetchApp === undefined) delete globalThis.UrlFetchApp;
    else globalThis.UrlFetchApp = previousUrlFetchApp;

    if (previousCacheService === undefined) delete globalThis.CacheService;
    else globalThis.CacheService = previousCacheService;
  }
}

test('response body accepts the byte limit and rejects one byte more', () => {
  const exactBody = `"${'a'.repeat(LIMITS.maxBodyBytes - 2)}"`;
  withFetchBody(exactBody, () => {
    assert.equal(runImportJSON('https://example.test/data.json')[1][0].length, LIMITS.maxBodyBytes - 2);
  });

  const oversizedBody = `"${'a'.repeat(LIMITS.maxBodyBytes - 1)}"`;
  withFetchBody(oversizedBody, () => {
    assert.throws(
      () => runImportJSON('https://example.test/data.json'),
      (error) => error.code === 'LIMIT_EXCEEDED',
    );
  });
});

test('response body limit counts UTF-8 bytes rather than JavaScript characters', () => {
  const oversizedBody = `"${'é'.repeat(Math.floor(LIMITS.maxBodyBytes / 2))}"`;

  withFetchBody(oversizedBody, () => {
    assert.throws(
      () => runImportJSON('https://example.test/data.json'),
      (error) => error.code === 'LIMIT_EXCEEDED',
    );
  });
});

test('JSON nesting accepts the depth limit and rejects one level more', () => {
  assert.doesNotThrow(() => table(nestedObject(LIMITS.maxDepth)));
  assert.throws(
    () => table(nestedObject(LIMITS.maxDepth + 1)),
    (error) => error.code === 'LIMIT_EXCEEDED',
  );
});

test('row count accepts the limit and rejects one row more', () => {
  const atLimit = Array.from({ length: LIMITS.maxRows }, (_, index) => index);
  assert.equal(table(atLimit).rows.length, LIMITS.maxRows);

  const overLimit = Array.from({ length: LIMITS.maxRows + 1 }, (_, index) => index);
  assert.throws(
    () => table(overLimit),
    (error) => error.code === 'LIMIT_EXCEEDED',
  );
});

test('JSONPath selection and shaping stop when they would exceed the row limit', () => {
  const values = Array.from({ length: LIMITS.maxRows + 1 }, (_, index) => index);

  assert.throws(
    () => table(values, { query: '$[*]' }),
    (error) => error.code === 'LIMIT_EXCEEDED',
  );

  assert.throws(
    () => table({ values }, { shape: '/values' }),
    (error) => error.code === 'LIMIT_EXCEEDED',
  );
});

test('explicit columns accept the limit and reject one column more', () => {
  const atLimit = Array.from({ length: LIMITS.maxColumns }, (_, index) => `/c${index}`);
  assert.equal(table([{}], { columns: atLimit }).headers.length, LIMITS.maxColumns);

  const overLimit = [...atLimit, `/c${LIMITS.maxColumns}`];
  assert.throws(
    () => table([{}], { columns: overLimit }),
    (error) => error.code === 'LIMIT_EXCEEDED',
  );
});

test('automatic projection stops as soon as unique columns exceed the limit', () => {
  const record = Object.fromEntries(
    Array.from({ length: LIMITS.maxColumns + 1 }, (_, index) => [`c${index}`, index]),
  );

  assert.throws(
    () => table([record]),
    (error) => error.code === 'LIMIT_EXCEEDED',
  );
});

test('rendered table accepts the cell limit and rejects a larger matrix', () => {
  const columns = Array.from({ length: LIMITS.maxColumns }, (_, index) => `/c${index}`);
  const rowsAtLimit = Math.floor(LIMITS.maxCells / LIMITS.maxColumns) - 1;
  const atLimit = Array.from({ length: rowsAtLimit }, () => ({}));

  const result = table(atLimit, { columns });
  assert.equal((result.rows.length + 1) * result.headers.length, LIMITS.maxCells);

  const overLimit = [...atLimit, {}];
  assert.throws(
    () => table(overLimit, { columns }),
    (error) => error.code === 'LIMIT_EXCEEDED',
  );
});
