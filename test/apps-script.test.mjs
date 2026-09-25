import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runImportJSON } from '../src/apps-script.mjs';

function withRuntime({
  status = 200,
  body = '[]',
  error,
  headers = {},
  cacheGetError,
  cachePutError,
  cacheRemoveError,
  cacheServiceError,
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
      if (cacheGetError) throw cacheGetError;
      return values.has(key) ? values.get(key) : null;
    },
    put(key, value, expirationInSeconds) {
      cachePuts.push({ key, value, expirationInSeconds });
      if (cachePutError) throw cachePutError;
      values.set(key, value);
    },
    remove(key) {
      cacheRemoves.push(key);
      if (cacheRemoveError) throw cacheRemoveError;
      values.delete(key);
    },
  };

  globalThis.CacheService = {
    getScriptCache() {
      if (cacheServiceError) throw cacheServiceError;
      return cache;
    },
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
      return {
        getResponseCode() { return status; },
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

test('IMPORTJSON adapter performs one bounded GET and returns a Sheets matrix', () => {
  withRuntime({ body: '[{"a":1},{"a":2}]' }, ({ calls, cachePuts }) => {
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
    assert.equal(cachePuts.length, 1);
    assert.equal(cachePuts[0].expirationInSeconds, 3600);
  });
});

test('single-cell arguments and one-dimensional column ranges are accepted', () => {
  withRuntime({ body: '{"items":[{"a":1,"b":2}]}' }, () => {
    assert.deepEqual(runImportJSON(
      [['https://example.test/data.json']],
      [['$.items[*]']],
      [['/b', '/a']],
    ), [
      ['/b', '/a'],
      [2, 1],
    ]);
  });

  withRuntime({ body: '[{"a":1,"b":2}]' }, () => {
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

test('blank optional arguments are always treated as omitted', () => {
  withRuntime({ body: '[{"a":1,"b":2}]' }, () => {
    const expected = [
      ['/a', '/b'],
      [1, 2],
    ];

    assert.deepEqual(runImportJSON('https://example.test/data.json', ''), expected);
    assert.deepEqual(runImportJSON('https://example.test/data.json', undefined, ''), expected);
    assert.deepEqual(runImportJSON('https://example.test/data.json', undefined, undefined, ''), expected);
    assert.deepEqual(runImportJSON(
      'https://example.test/data.json',
      [['']],
      [['']],
      [['']],
      [['']],
    ), expected);
  });

  withRuntime({ body: '[{"id":1,"items":["a","b"]}]' }, () => {
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
});

test('adapter validates URL, query, columns, shape, and cache forms', () => {
  assert.throws(
    () => runImportJSON([['https://a.test'], ['https://b.test']]),
    (error) => error.code === 'INVALID_ARGUMENT',
  );
  assert.throws(
    () => runImportJSON('ftp://example.test/data.json'),
    (error) => error.code === 'INVALID_URL',
  );

  withRuntime({ body: '{}' }, () => {
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

    for (const cache of ['unknown', true, false, -1, 0, 1, 2]) {
      assert.throws(
        () => runImportJSON('https://example.test/data.json', undefined, undefined, undefined, cache),
        (error) => error.code === 'INVALID_ARGUMENT',
        String(cache),
      );
    }

    assert.throws(
      () => runImportJSON(
        'https://example.test/data.json',
        undefined,
        undefined,
        undefined,
        [['default'], ['off']],
      ),
      (error) => error.code === 'INVALID_ARGUMENT',
    );
  });
});

test('network and non-2xx failures become HTTP_ERROR without leaking native details', () => {
  withRuntime({ error: new Error('secret token=abc') }, ({ cachePuts }) => {
    assert.throws(
      () => runImportJSON('https://example.test/data.json'),
      (error) => error.code === 'HTTP_ERROR' && !error.message.includes('secret'),
    );
    assert.equal(cachePuts.length, 0);
  });

  withRuntime({ status: 404, body: 'private remote body' }, ({ cachePuts }) => {
    assert.throws(
      () => runImportJSON('https://example.test/data.json'),
      (error) => error.code === 'HTTP_ERROR' && !error.message.includes('private remote body'),
    );
    assert.equal(cachePuts.length, 0);
  });
});

test('invalid JSON after a successful response becomes INVALID_JSON and is not cached', () => {
  withRuntime({ body: '{' }, ({ cachePuts }) => {
    assert.throws(
      () => runImportJSON('https://example.test/data.json'),
      (error) => error.code === 'INVALID_JSON',
    );
    assert.equal(cachePuts.length, 0);
  });
});

test('failed transformation does not populate the cache', () => {
  withRuntime({ body: '[{"items":1}]' }, ({ cachePuts }) => {
    assert.throws(
      () => runImportJSON('https://example.test/data.json', undefined, undefined, '/items'),
      (error) => error.code === 'INVALID_EXPANSION_TARGET',
    );
    assert.equal(cachePuts.length, 0);
  });
});

test('renderer maps null and missing to blank cells and handles unknown schema', () => {
  withRuntime({ body: '[{"a":null},{}]' }, () => {
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

  withRuntime({ body: '[{},{}]' }, () => {
    assert.deepEqual(runImportJSON('https://example.test/data.json'), [['']]);
  });
});

test('same URL shares one cached body across query, columns, and shape variants', () => {
  withRuntime({ body: '{"items":[{"a":1,"b":2}]}' }, ({ calls }) => {
    assert.deepEqual(runImportJSON(
      'https://example.test/data.json',
      '$.items[*]',
      '/a',
    ), [
      ['/a'],
      [1],
    ]);

    assert.deepEqual(runImportJSON(
      'https://example.test/data.json',
      '$.items[*]',
      '/b',
    ), [
      ['/b'],
      [2],
    ]);

    assert.deepEqual(runImportJSON(
      'https://example.test/data.json',
      undefined,
      '/items/a',
      '/items',
    ), [
      ['/items/a'],
      [1],
    ]);

    assert.equal(calls.length, 1);
  });
});

test('cache default, refresh, and off modes have distinct read and write behavior', () => {
  withRuntime({
    body: (fetchNumber) => `[{"a":${fetchNumber}}]`,
  }, ({ calls, cacheGets, cachePuts, cacheRemoves, values }) => {
    assert.deepEqual(runImportJSON('https://example.test/data.json'), [
      ['/a'],
      [1],
    ]);
    assert.deepEqual(runImportJSON('https://example.test/data.json', undefined, undefined, undefined, 'off'), [
      ['/a'],
      [2],
    ]);
    assert.deepEqual(runImportJSON('https://example.test/data.json', undefined, undefined, undefined, 'off'), [
      ['/a'],
      [3],
    ]);
    assert.deepEqual(runImportJSON('https://example.test/data.json', undefined, undefined, undefined, 'default'), [
      ['/a'],
      [1],
    ]);
    assert.deepEqual(runImportJSON('https://example.test/data.json', undefined, undefined, undefined, 'refresh'), [
      ['/a'],
      [4],
    ]);
    assert.deepEqual(runImportJSON('https://example.test/data.json', undefined, undefined, undefined, ''), [
      ['/a'],
      [4],
    ]);

    assert.equal(calls.length, 4);
    assert.equal(cacheGets.length, 3);
    assert.equal(cachePuts.length, 2);
    assert.equal(cacheRemoves.length, 0);
    assert.equal(new Set(cacheGets).size, 1);
    assert.equal(new Set(cachePuts.map(({ key }) => key)).size, 1);
    assert.deepEqual(Array.from(values.values()), ['[{"a":4}]']);
  });
});

test('cache keys are stable per URL, hashed, and do not expose the URL', () => {
  withRuntime({ body: '[{"a":1}]' }, ({ calls, cacheGets, cachePuts }) => {
    runImportJSON('https://example.test/data.json?secret=abc');
    runImportJSON('https://example.test/data.json?secret=abc');
    runImportJSON('https://example.test/other.json?secret=abc');

    assert.equal(calls.length, 2);
    assert.equal(cacheGets[0], cacheGets[1]);
    assert.notEqual(cacheGets[0], cacheGets[2]);
    assert.match(cacheGets[0], /^importjson:http:v1:[0-9a-f]{64}$/);
    assert.equal(cacheGets[0].includes('example.test'), false);
    assert.equal(cacheGets[0].includes('secret'), false);
    assert.equal(cachePuts.length, 2);
  });
});

test('cache read, write, remove, and service failures never change IMPORTJSON success behavior', () => {
  withRuntime({
    body: '[{"a":1}]',
    cacheGetError: new Error('cache unavailable'),
  }, ({ calls }) => {
    assert.deepEqual(runImportJSON('https://example.test/data.json'), [
      ['/a'],
      [1],
    ]);
    assert.equal(calls.length, 1);
  });

  withRuntime({
    body: '[{"a":1}]',
    cachePutError: new Error('value too large'),
  }, ({ calls }) => {
    assert.deepEqual(runImportJSON('https://example.test/data.json'), [
      ['/a'],
      [1],
    ]);
    assert.equal(calls.length, 1);
  });

  withRuntime({
    body: '[{"a":1}]',
    headers: { 'Cache-Control': 'no-store' },
    cacheRemoveError: new Error('remove unavailable'),
  }, ({ calls }) => {
    assert.deepEqual(runImportJSON('https://example.test/data.json'), [
      ['/a'],
      [1],
    ]);
    assert.equal(calls.length, 1);
  });

  withRuntime({
    body: '[{"a":1}]',
    cacheServiceError: new Error('cache service unavailable'),
  }, ({ calls }) => {
    assert.deepEqual(runImportJSON('https://example.test/data.json'), [
      ['/a'],
      [1],
    ]);
    assert.equal(calls.length, 1);
  });
});

test('shared-cache HTTP directives can disable storage', () => {
  for (const cacheControl of ['no-store', 'no-cache', 'private', 'max-age=0', 's-maxage=0']) {
    withRuntime({
      body: '[{"a":1}]',
      headers: { 'Cache-Control': cacheControl },
    }, ({ cachePuts }) => {
      runImportJSON('https://example.test/data.json');
      assert.equal(cachePuts.length, 0, cacheControl);
    });
  }

  withRuntime({
    body: '[{"a":1}]',
    headers: { Vary: '*' },
  }, ({ cachePuts }) => {
    runImportJSON('https://example.test/data.json');
    assert.equal(cachePuts.length, 0);
  });
});

test('fresh response that forbids shared storage clears an older cached body', () => {
  withRuntime({
    body: (fetchNumber) => `[{"a":${fetchNumber}}]`,
    headers: (fetchNumber) => (
      fetchNumber === 2 ? { 'Cache-Control': 'no-store' } : {}
    ),
  }, ({ calls, cacheRemoves }) => {
    assert.deepEqual(runImportJSON('https://example.test/data.json'), [
      ['/a'],
      [1],
    ]);
    assert.deepEqual(runImportJSON('https://example.test/data.json', undefined, undefined, undefined, 'refresh'), [
      ['/a'],
      [2],
    ]);
    assert.deepEqual(runImportJSON('https://example.test/data.json'), [
      ['/a'],
      [3],
    ]);

    assert.equal(calls.length, 3);
    assert.equal(cacheRemoves.length, 1);
  });
});

test('origin freshness can shorten but not extend the 3600-second cache TTL', () => {
  withRuntime({
    body: '[{"a":1}]',
    headers: { 'Cache-Control': 'public, max-age=30' },
  }, ({ cachePuts }) => {
    runImportJSON('https://example.test/data.json');
    assert.equal(cachePuts[0].expirationInSeconds, 30);
  });

  withRuntime({
    body: '[{"a":1}]',
    headers: { 'Cache-Control': 'max-age=120, s-maxage=45' },
  }, ({ cachePuts }) => {
    runImportJSON('https://example.test/data.json');
    assert.equal(cachePuts[0].expirationInSeconds, 45);
  });

  withRuntime({
    body: '[{"a":1}]',
    headers: { 'Cache-Control': 'max-age=7200' },
  }, ({ cachePuts }) => {
    runImportJSON('https://example.test/data.json');
    assert.equal(cachePuts[0].expirationInSeconds, 3600);
  });
});

test('merge shape flows through the public adapter', () => {
  withRuntime({ body: '{"profile":{"name":"Apple"},"details":{"symbol":"AAPL"}}' }, () => {
    assert.deepEqual(runImportJSON(
      'https://example.test/data.json',
      "$['profile','details']",
      undefined,
      'merge',
    ), [
      ['/name', '/symbol'],
      ['Apple', 'AAPL'],
    ]);
  });
});

test('columnar shape flows through the public adapter', () => {
  withRuntime({ body: '{"ticker":"AAPL","year":[2024,2025],"eps":[6.08,7.46]}' }, () => {
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
