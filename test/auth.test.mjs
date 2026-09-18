import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runImportJSON } from '../src/apps-script.mjs';

function withRuntime({
  status = 200,
  body = '[{"ok":true}]',
  headers = {},
  error,
} = {}, callback) {
  const previousUrlFetchApp = globalThis.UrlFetchApp;
  const previousCacheService = globalThis.CacheService;
  const previousUtilities = globalThis.Utilities;
  const calls = [];
  const cacheGets = [];
  const cachePuts = [];
  const cacheRemoves = [];
  const values = new Map();

  const cache = {
    get(key) {
      cacheGets.push(key);
      return values.has(key) ? values.get(key) : null;
    },
    put(key, value, expirationInSeconds) {
      cachePuts.push({ key, value, expirationInSeconds });
      values.set(key, value);
    },
    remove(key) {
      cacheRemoves.push(key);
      values.delete(key);
    },
  };

  globalThis.CacheService = {
    getScriptCache() { return cache; },
  };

  globalThis.Utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest(algorithm, value, charset) {
      assert.equal(algorithm, 'SHA_256');
      assert.equal(charset, 'UTF_8');
      return Array.from(createHash('sha256').update(value, 'utf8').digest(), (byte) => (
        byte > 127 ? byte - 256 : byte
      ));
    },
  };

  globalThis.UrlFetchApp = {
    fetch(url, options) {
      calls.push({ url, options });
      if (error) throw error;
      const fetchNumber = calls.length;
      const responseBody = typeof body === 'function' ? body(fetchNumber) : body;
      const responseHeaders = typeof headers === 'function' ? headers(fetchNumber) : headers;
      const responseStatus = typeof status === 'function' ? status(fetchNumber) : status;
      return {
        getResponseCode() { return responseStatus; },
        getContentText() { return responseBody; },
        getAllHeaders() { return responseHeaders; },
      };
    },
  };

  try {
    return callback({ calls, cacheGets, cachePuts, cacheRemoves, values });
  } finally {
    if (previousUrlFetchApp === undefined) delete globalThis.UrlFetchApp;
    else globalThis.UrlFetchApp = previousUrlFetchApp;

    if (previousCacheService === undefined) delete globalThis.CacheService;
    else globalThis.CacheService = previousCacheService;

    if (previousUtilities === undefined) delete globalThis.Utilities;
    else globalThis.Utilities = previousUtilities;
  }
}

test('Authorization is sent exactly over HTTPS and disables automatic redirects', () => {
  withRuntime({}, ({ calls }) => {
    assert.deepEqual(runImportJSON(
      'https://example.test/private.json',
      undefined,
      undefined,
      undefined,
      'off',
      'Bearer token-abc',
    ), [
      ['/ok'],
      [true],
    ]);

    assert.deepEqual(calls, [{
      url: 'https://example.test/private.json',
      options: {
        method: 'get',
        followRedirects: false,
        muteHttpExceptions: true,
        timeoutSeconds: 20,
        headers: { Authorization: 'Bearer token-abc' },
      },
    }]);
  });
});

test('authorization accepts a single cell and blank means anonymous', () => {
  withRuntime({}, ({ calls }) => {
    runImportJSON(
      'https://example.test/private.json',
      undefined,
      undefined,
      undefined,
      'off',
      [['Bearer token-abc']],
    );
    runImportJSON(
      'https://example.test/public.json',
      undefined,
      undefined,
      undefined,
      'off',
      [['']],
    );

    assert.deepEqual(calls[0].options.headers, { Authorization: 'Bearer token-abc' });
    assert.equal(calls[0].options.followRedirects, false);
    assert.equal('headers' in calls[1].options, false);
    assert.equal(calls[1].options.followRedirects, true);
  });
});

test('authorization rejects unsupported values and authenticated HTTP URLs', () => {
  for (const authorization of [true, 1, [['a'], ['b']], 'Bearer abc\nInjected: value', 'Bearer abc\tdef']) {
    assert.throws(
      () => runImportJSON(
        'https://example.test/private.json',
        undefined,
        undefined,
        undefined,
        'off',
        authorization,
      ),
      (error) => error.code === 'INVALID_ARGUMENT',
      String(authorization),
    );
  }

  assert.throws(
    () => runImportJSON(
      'http://example.test/private.json',
      undefined,
      undefined,
      undefined,
      'off',
      'Bearer token-abc',
    ),
    (error) => error.code === 'INVALID_URL',
  );
});

test('authenticated failures and redirects do not expose credentials or response bodies', () => {
  for (const status of [302, 401, 403]) {
    withRuntime({ status, body: 'secret remote body' }, ({ calls, cachePuts }) => {
      assert.throws(
        () => runImportJSON(
          'https://example.test/private.json',
          undefined,
          undefined,
          undefined,
          'off',
          'Bearer super-secret',
        ),
        (error) => (
          error.code === 'HTTP_ERROR'
          && !error.message.includes('super-secret')
          && !error.message.includes('secret remote body')
        ),
      );
      assert.equal(calls[0].options.followRedirects, false);
      assert.equal(cachePuts.length, 0);
    });
  }
});

test('authenticated cache identity is partitioned by exact Authorization value', () => {
  withRuntime({
    body: (fetchNumber) => `[{"request":${fetchNumber}}]`,
    headers: { 'Cache-Control': 'public, max-age=300' },
  }, ({ calls, cacheGets, cachePuts }) => {
    const first = runImportJSON(
      'https://example.test/private.json', undefined, undefined, undefined, 'default', 'Bearer token-a',
    );
    const second = runImportJSON(
      'https://example.test/private.json', undefined, undefined, undefined, 'default', 'Bearer token-a',
    );
    const third = runImportJSON(
      'https://example.test/private.json', undefined, undefined, undefined, 'default', 'Bearer token-b',
    );

    assert.deepEqual(first, [['/request'], [1]]);
    assert.deepEqual(second, [['/request'], [1]]);
    assert.deepEqual(third, [['/request'], [2]]);
    assert.equal(calls.length, 2);
    assert.equal(cachePuts.length, 2);
    assert.equal(cacheGets[0], cacheGets[1]);
    assert.notEqual(cacheGets[0], cacheGets[2]);
    for (const key of cacheGets) {
      assert.match(key, /^importjson:http:v1:[0-9a-f]{64}$/);
      assert.equal(key.includes('token-a'), false);
      assert.equal(key.includes('token-b'), false);
      assert.equal(key.includes('example.test'), false);
    }
  });
});

test('authenticated responses require explicit shared-cache permission', () => {
  for (const cacheControl of [undefined, 'max-age=300']) {
    withRuntime({
      headers: cacheControl === undefined ? {} : { 'Cache-Control': cacheControl },
    }, ({ calls, cachePuts, cacheRemoves }) => {
      runImportJSON(
        'https://example.test/private.json', undefined, undefined, undefined, 'default', 'Bearer token-a',
      );
      runImportJSON(
        'https://example.test/private.json', undefined, undefined, undefined, 'default', 'Bearer token-a',
      );

      assert.equal(calls.length, 2, String(cacheControl));
      assert.equal(cachePuts.length, 0, String(cacheControl));
      assert.equal(cacheRemoves.length, 2, String(cacheControl));
    });
  }

  for (const cacheControl of ['public, max-age=300', 's-maxage=300', 'must-revalidate']) {
    withRuntime({ headers: { 'Cache-Control': cacheControl } }, ({ calls, cachePuts }) => {
      runImportJSON(
        'https://example.test/private.json', undefined, undefined, undefined, 'default', 'Bearer token-a',
      );
      runImportJSON(
        'https://example.test/private.json', undefined, undefined, undefined, 'default', 'Bearer token-a',
      );

      assert.equal(calls.length, 1, cacheControl);
      assert.equal(cachePuts.length, 1, cacheControl);
      assert.equal(cachePuts[0].expirationInSeconds, cacheControl === 'must-revalidate' ? 3600 : 300);
    });
  }
});

test('restrictive and invalid cache directives do not enable authenticated storage', () => {
  for (const cacheControl of [
    'public, no-store, max-age=300',
    'public, no-cache, max-age=300',
    'public, private, max-age=300',
    's-maxage=0',
    'public=wrong, max-age=300',
    'must-revalidate=wrong',
  ]) {
    withRuntime({ headers: { 'Cache-Control': cacheControl } }, ({ cachePuts }) => {
      runImportJSON(
        'https://example.test/private.json', undefined, undefined, undefined, 'default', 'Bearer token-a',
      );
      assert.equal(cachePuts.length, 0, cacheControl);
    });
  }

  withRuntime({
    headers: { 'Cache-Control': 'public, max-age=300', Vary: '*' },
  }, ({ cachePuts }) => {
    runImportJSON(
      'https://example.test/private.json', undefined, undefined, undefined, 'default', 'Bearer token-a',
    );
    assert.equal(cachePuts.length, 0);
  });
});

test('authenticated cache modes preserve default, refresh, and off semantics', () => {
  withRuntime({
    body: (fetchNumber) => `[{"request":${fetchNumber}}]`,
    headers: { 'Cache-Control': 'public, max-age=300' },
  }, ({ calls, cacheGets, cachePuts, cacheRemoves }) => {
    assert.deepEqual(runImportJSON(
      'https://example.test/private.json', undefined, undefined, undefined, 'default', 'Bearer token-a',
    ), [['/request'], [1]]);
    assert.deepEqual(runImportJSON(
      'https://example.test/private.json', undefined, undefined, undefined, 'off', 'Bearer token-a',
    ), [['/request'], [2]]);
    assert.deepEqual(runImportJSON(
      'https://example.test/private.json', undefined, undefined, undefined, 'default', 'Bearer token-a',
    ), [['/request'], [1]]);
    assert.deepEqual(runImportJSON(
      'https://example.test/private.json', undefined, undefined, undefined, 'refresh', 'Bearer token-a',
    ), [['/request'], [3]]);
    assert.deepEqual(runImportJSON(
      'https://example.test/private.json', undefined, undefined, undefined, 'default', 'Bearer token-a',
    ), [['/request'], [3]]);

    assert.equal(calls.length, 3);
    assert.equal(cacheGets.length, 3);
    assert.equal(cachePuts.length, 2);
    assert.equal(cacheRemoves.length, 0);
  });
});
