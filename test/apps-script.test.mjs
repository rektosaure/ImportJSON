import test from 'node:test';
import assert from 'node:assert/strict';
import { runImportJSON } from '../src/apps-script.mjs';

function withFetch({ status = 200, body = '[]', error }, callback) {
  const previous = globalThis.UrlFetchApp;
  const calls = [];

  globalThis.UrlFetchApp = {
    fetch(url, options) {
      calls.push({ url, options });
      if (error) throw error;
      return {
        getResponseCode() { return status; },
        getContentText() { return body; },
      };
    },
  };

  try {
    return callback(calls);
  } finally {
    if (previous === undefined) delete globalThis.UrlFetchApp;
    else globalThis.UrlFetchApp = previous;
  }
}

test('IMPORTJSON adapter performs one bounded GET and returns a Sheets matrix', () => {
  withFetch({ body: '[{"a":1},{"a":2}]' }, (calls) => {
    assert.deepEqual(runImportJSON('https://example.test/data.json'), [
      ['/a'],
      [1],
      [2],
    ]);

    assert.deepEqual(calls, [{
      url: 'https://example.test/data.json',
      options: {
        method: 'get',
        followRedirects: true,
        muteHttpExceptions: true,
        timeoutSeconds: 20,
      },
    }]);
  });
});

test('single-cell arguments and one-dimensional column ranges are accepted', () => {
  withFetch({ body: '{"items":[{"a":1,"b":2}]}' }, () => {
    assert.deepEqual(runImportJSON(
      [['https://example.test/data.json']],
      [['$.items[*]']],
      [['/b', '/a']],
    ), [
      ['/b', '/a'],
      [2, 1],
    ]);
  });

  withFetch({ body: '[{"a":1,"b":2}]' }, () => {
    assert.deepEqual(runImportJSON(
      'https://example.test/data.json',
      undefined,
      [['/b'], ['/a']],
    ), [
      ['/b', '/a'],
      [2, 1],
    ]);
  });
});

test('blank positional placeholders are treated as omitted before later optional arguments', () => {
  withFetch({ body: '[{"a":1,"b":2}]' }, () => {
    assert.deepEqual(runImportJSON(
      'https://example.test/data.json',
      '',
      [['/b'], ['/a']],
    ), [
      ['/b', '/a'],
      [2, 1],
    ]);
  });

  withFetch({ body: '[{"id":1,"items":["a","b"]}]' }, () => {
    assert.deepEqual(runImportJSON(
      'https://example.test/data.json',
      '',
      '',
      '/items',
    ), [
      ['/id', '/items'],
      [1, 'a'],
      [1, 'b'],
    ]);
  });

  withFetch({ body: '[{"a":1}]' }, () => {
    assert.deepEqual(runImportJSON(
      'https://example.test/data.json',
      '',
      '',
      '',
      'refresh-1',
    ), [
      ['/a'],
      [1],
    ]);

    assert.throws(
      () => runImportJSON('https://example.test/data.json', ''),
      (error) => error.code === 'INVALID_ARGUMENT',
    );
  });
});

test('adapter validates URL, query, columns, and shape forms', () => {
  assert.throws(
    () => runImportJSON([['https://a.test'], ['https://b.test']]),
    (error) => error.code === 'INVALID_ARGUMENT',
  );
  assert.throws(
    () => runImportJSON('ftp://example.test/data.json'),
    (error) => error.code === 'INVALID_URL',
  );

  withFetch({ body: '{}' }, () => {
    assert.throws(
      () => runImportJSON('https://example.test/data.json', [['$'], ['$']]),
      (error) => error.code === 'INVALID_ARGUMENT',
    );
    assert.throws(
      () => runImportJSON('https://example.test/data.json', undefined, [['/a', '/b'], ['/c', '/d']]),
      (error) => error.code === 'INVALID_ARGUMENT',
    );
    assert.throws(
      () => runImportJSON('https://example.test/data.json', undefined, [['/a', '']]),
      (error) => error.code === 'INVALID_ARGUMENT',
    );
    assert.throws(
      () => runImportJSON('https://example.test/data.json', undefined, undefined, [['/a'], ['/b']]),
      (error) => error.code === 'INVALID_ARGUMENT',
    );
    assert.throws(
      () => runImportJSON('https://example.test/data.json', undefined, undefined, 'unknown'),
      (error) => error.code === 'INVALID_ARGUMENT',
    );
  });
});

test('network and non-2xx failures become HTTP_ERROR without leaking native details', () => {
  withFetch({ error: new Error('secret token=abc') }, () => {
    assert.throws(
      () => runImportJSON('https://example.test/data.json'),
      (error) => error.code === 'HTTP_ERROR' && !error.message.includes('secret'),
    );
  });

  withFetch({ status: 404, body: 'private remote body' }, () => {
    assert.throws(
      () => runImportJSON('https://example.test/data.json'),
      (error) => error.code === 'HTTP_ERROR' && !error.message.includes('private remote body'),
    );
  });
});

test('invalid JSON after a successful response becomes INVALID_JSON', () => {
  withFetch({ body: '{' }, () => {
    assert.throws(
      () => runImportJSON('https://example.test/data.json'),
      (error) => error.code === 'INVALID_JSON',
    );
  });
});

test('renderer maps null and missing to blank cells and handles unknown schema', () => {
  withFetch({ body: '[{"a":null},{}]' }, () => {
    assert.deepEqual(runImportJSON(
      'https://example.test/data.json',
      undefined,
      '/a',
    ), [
      ['/a'],
      [''],
      [''],
    ]);
  });

  withFetch({ body: '[{},{}]' }, () => {
    assert.deepEqual(runImportJSON('https://example.test/data.json'), [['']]);
  });
});

test('pointer shape and refreshKey flow through the public adapter', () => {
  withFetch({ body: '[{"id":1,"items":["a","b"]}]' }, () => {
    const first = runImportJSON(
      'https://example.test/data.json',
      undefined,
      undefined,
      '/items',
      'refresh-1',
    );
    const second = runImportJSON(
      'https://example.test/data.json',
      undefined,
      undefined,
      '/items',
      'refresh-2',
    );

    assert.deepEqual(first, [
      ['/id', '/items'],
      [1, 'a'],
      [1, 'b'],
    ]);
    assert.deepEqual(second, first);
  });
});

test('columnar shape flows through the public adapter', () => {
  withFetch({ body: '{"ticker":"AAPL","year":[2024,2025],"eps":[6.08,7.46]}' }, () => {
    assert.deepEqual(runImportJSON(
      'https://example.test/data.json',
      undefined,
      [['/year'], ['/eps'], ['/ticker']],
      'columnar',
    ), [
      ['/year', '/eps', '/ticker'],
      [2024, 6.08, 'AAPL'],
      [2025, 7.46, 'AAPL'],
    ]);
  });
});
