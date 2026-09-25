import test from 'node:test';
import assert from 'node:assert/strict';
import { jsonTextToTable } from '../src/core.mjs';

function table(document, options) {
  return jsonTextToTable(JSON.stringify(document), options);
}

test('parses JSON text and rejects invalid JSON', () => {
  assert.deepEqual(jsonTextToTable('{"a":1}'), {
    headers: ['/a'],
    rows: [[1]],
  });

  assert.throws(
    () => jsonTextToTable('{'),
    (error) => error.code === 'INVALID_JSON',
  );
});

test('omitted query turns root array elements into records', () => {
  assert.deepEqual(table([{ a: 1 }, { a: 2 }]), {
    headers: ['/a'],
    rows: [[1], [2]],
  });
});

test('omitted query turns a non-array root into one record', () => {
  assert.deepEqual(table({ a: 1 }), {
    headers: ['/a'],
    rows: [[1]],
  });
});

test('explicit root query is distinct from omitted query on an array', () => {
  assert.deepEqual(table([{ a: 1 }, { a: 2 }], { query: '$' }), {
    headers: ['@value'],
    rows: [['[{"a":1},{"a":2}]']],
  });
});

test('JSONPath selects records in engine order and preserves multiplicity', () => {
  assert.deepEqual(table([
    { value: 'a' },
    { value: 'b' },
  ], { query: '$[1,0,1]' }), {
    headers: ['/value'],
    rows: [['b'], ['a'], ['b']],
  });
});

test('object wildcard selection uses Unicode code-point order', () => {
  assert.deepEqual(table({
    b: { value: 2 },
    a: { value: 1 },
  }, { query: '$.*' }), {
    headers: ['/value'],
    rows: [[1], [2]],
  });
});

test('query validation distinguishes invalid arguments from invalid JSONPath', () => {
  assert.throws(
    () => table({}, { query: '' }),
    (error) => error.code === 'INVALID_ARGUMENT',
  );
  assert.throws(
    () => table({}, { query: 42 }),
    (error) => error.code === 'INVALID_ARGUMENT',
  );
  assert.throws(
    () => table({}, { query: '$[' }),
    (error) => error.code === 'INVALID_JSONPATH',
  );
});

test('automatic projection flattens objects and unions schema', () => {
  const result = table([
    { z: 1, nested: { name: 'A' } },
    { a: 2, nested: { value: 3 } },
  ]);

  assert.deepEqual(result.headers, ['/a', '/nested/name', '/nested/value', '/z']);
  assert.deepEqual(result.rows[0], [undefined, 'A', undefined, 1]);
  assert.deepEqual(result.rows[1], [2, undefined, 3, undefined]);
});

test('automatic projection preserves scalar values and serializes arrays', () => {
  const result = table(['  keep  ', '2026-09-11', null, true, 12, [{ b: 1, a: 2 }]]);

  assert.deepEqual(result.headers, ['@value']);
  assert.deepEqual(result.rows, [
    ['  keep  '],
    ['2026-09-11'],
    [null],
    [true],
    [12],
    ['[{"a":2,"b":1}]'],
  ]);
});

test('empty objects contribute no automatic columns', () => {
  assert.deepEqual(table([{}, { nested: {} }]), {
    headers: [],
    rows: [[], []],
  });
});

test('automatic headers use escaped JSON Pointers and Unicode code-point order', () => {
  const result = table([{ 'a/b': 1, 'm~n': 2, '2': 3, '10': 4, '\u{10000}': 5, '\uE000': 6 }]);

  assert.deepEqual(result.headers, ['/10', '/2', '/a~1b', '/m~0n', '/\uE000', '/\u{10000}']);
});

test('automatic projection combines object and non-object rows', () => {
  assert.deepEqual(table([
    { a: 1 },
    2,
    null,
    [3, 4],
    {},
  ]), {
    headers: ['/a', '@value'],
    rows: [
      [1, undefined],
      [undefined, 2],
      [undefined, null],
      [undefined, '[3,4]'],
      [undefined, undefined],
    ],
  });
});

test('explicit projection preserves order and distinguishes missing from null', () => {
  assert.deepEqual(table([
    { company: { name: 'Acme' }, value: null },
    { company: {} },
  ], { columns: ['/value', '/company/name'] }), {
    headers: ['/value', '/company/name'],
    rows: [
      [null, 'Acme'],
      [undefined, undefined],
    ],
  });
});

test('explicit projection resolves JSON Pointer escapes and array indices', () => {
  assert.deepEqual(table([
    { 'a/b': { 'm~n': [{ value: 1 }] } },
  ], { columns: ['/a~1b/m~0n/0/value', '/a~1b/m~0n/1/value'] }).rows, [[1, undefined]]);
});

test('explicit structured values are serialized canonically, including empty objects', () => {
  assert.deepEqual(table([
    { empty: {}, structured: { z: [3, { b: 2, a: 1 }], a: true, '2': 2, '10': 10 } },
  ], { columns: ['/empty', '/structured'] }).rows, [[
    '{}',
    '{"10":10,"2":2,"a":true,"z":[3,{"a":1,"b":2}]}',
  ]]);
});

test('explicit projection rejects duplicate and invalid JSON Pointers', () => {
  assert.throws(
    () => table([{}], { columns: ['/a', '/a'] }),
    (error) => error.code === 'INVALID_ARGUMENT',
  );
  assert.throws(
    () => table([{}], { columns: ['a'] }),
    (error) => error.code === 'INVALID_ARGUMENT',
  );
  assert.throws(
    () => table([{}], { columns: ['/a~2b'] }),
    (error) => error.code === 'INVALID_ARGUMENT',
  );
});

test('empty selection preserves explicit headers but has no automatic schema', () => {
  assert.deepEqual(table([]), { headers: [], rows: [] });
  assert.deepEqual(table([], { columns: ['/a'] }), {
    headers: ['/a'],
    rows: [],
  });
});

test('shape JSON Pointer expands scalar array values and repeats outside properties', () => {
  assert.deepEqual(table([
    { id: 1, tags: ['a', 'b'] },
  ], { shape: '/tags' }), {
    headers: ['/id', '/tags'],
    rows: [[1, 'a'], [1, 'b']],
  });
});

test('shape JSON Pointer expands object elements under the target pointer', () => {
  assert.deepEqual(table([
    { id: 1, items: [{ b: 2 }, { a: 1 }] },
  ], { shape: '/items' }), {
    headers: ['/id', '/items/a', '/items/b'],
    rows: [[1, undefined, 2], [1, 1, undefined]],
  });
});

test('shape JSON Pointer allows heterogeneous values without a cartesian product', () => {
  assert.deepEqual(table([
    { items: [{ a: 1 }, 2, null, [3, 4]] },
  ], { shape: '/items' }), {
    headers: ['/items', '/items/a'],
    rows: [
      [undefined, 1],
      [2, undefined],
      [null, undefined],
      ['[3,4]', undefined],
    ],
  });
});

test('empty pointer expansion has no automatic schema but preserves explicit headers', () => {
  const document = [{ id: 1, items: [] }];

  assert.deepEqual(table(document, { shape: '/items' }), {
    headers: [],
    rows: [],
  });
  assert.deepEqual(table(document, { shape: '/items', columns: ['/id', '/items'] }), {
    headers: ['/id', '/items'],
    rows: [],
  });
});

test('missing and null pointer targets each produce one row', () => {
  assert.deepEqual(table([
    { id: 1 },
    { id: 2, items: null },
  ], { shape: '/items' }), {
    headers: ['/id', '/items'],
    rows: [[1, undefined], [2, null]],
  });
});

test('explicit projection is resolved after pointer shaping', () => {
  assert.deepEqual(table([
    { id: 1, items: [{ value: 'a' }, { value: 'b' }] },
  ], { shape: '/items', columns: ['/items/value', '/id'] }), {
    headers: ['/items/value', '/id'],
    rows: [['a', 1], ['b', 1]],
  });
});

test('nested arrays are serialized rather than shaped a second time', () => {
  assert.deepEqual(table([
    { items: [[1, 2], [3]] },
  ], { shape: '/items' }), {
    headers: ['/items'],
    rows: [['[1,2]'], ['[3]']],
  });
});

test('invalid pointer shape and non-array target fail explicitly', () => {
  assert.throws(
    () => table([{ items: [] }], { shape: 'items' }),
    (error) => error.code === 'INVALID_ARGUMENT',
  );
  assert.throws(
    () => table([{ items: 1 }], { shape: '/items' }),
    (error) => error.code === 'INVALID_EXPANSION_TARGET',
  );
});

test('combine shape keeps selected sibling member names and duplicate child fields', () => {
  assert.deepEqual(table({
    profile: { name: 'Apple', cik: '0000320193' },
    details: { symbol: 'AAPL', cik: '0000320193' },
    dividends: { yield: '0.32%' },
  }, { query: "$['profile','details','dividends']", shape: 'combine' }), {
    headers: ['/details/cik', '/details/symbol', '/dividends/yield', '/profile/cik', '/profile/name'],
    rows: [['0000320193', 'AAPL', '0.32%', '0000320193', 'Apple']],
  });
});

test('combine shape supports explicit projection after reconstructing sibling members', () => {
  assert.deepEqual(table({
    company: {
      profile: { name: 'Apple' },
      details: { symbol: 'AAPL' },
    },
  }, {
    query: "$.company['profile','details']",
    shape: 'combine',
    columns: ['/details/symbol', '/profile/name'],
  }), {
    headers: ['/details/symbol', '/profile/name'],
    rows: [['AAPL', 'Apple']],
  });
});

test('combine shape keeps an empty selection empty', () => {
  assert.deepEqual(table({ a: 1 }, { query: '$.missing[*]', shape: 'combine' }), {
    headers: [],
    rows: [],
  });
});

test('combine shape rejects selections that are not sibling object members', () => {
  assert.throws(
    () => table({ a: 1 }, { query: '$', shape: 'combine' }),
    (error) => error.code === 'INVALID_COMBINE_TARGET',
  );

  assert.throws(
    () => table({
      left: { a: 1 },
      right: { b: 2 },
    }, { query: "$['left','right'].*", shape: 'combine' }),
    (error) => error.code === 'INVALID_COMBINE_TARGET',
  );

  assert.throws(
    () => table([{ a: 1 }, { b: 2 }], { query: '$[*]', shape: 'combine' }),
    (error) => error.code === 'INVALID_COMBINE_TARGET',
  );
});

test('combine shape rejects duplicate selection of the same member', () => {
  assert.throws(
    () => table({ a: 1 }, { query: "$['a','a']", shape: 'combine' }),
    (error) => error.code === 'COMBINE_CONFLICT',
  );
});

test('combine shape preserves __proto__ as a data property', () => {
  assert.deepEqual(jsonTextToTable(
    '{"__proto__":{"source":"api"},"value":1}',
    { query: "$['__proto__','value']", shape: 'combine' },
  ), {
    headers: ['/__proto__/source', '/value'],
    rows: [['api', 1]],
  });
});

test('columnar shape zips direct arrays by index and repeats non-array properties', () => {
  assert.deepEqual(table({
    ticker: 'AAPL',
    year: [2024, 2025],
    eps: [6.08, 7.46],
  }, { shape: 'columnar' }), {
    headers: ['/eps', '/ticker', '/year'],
    rows: [
      [6.08, 'AAPL', 2024],
      [7.46, 'AAPL', 2025],
    ],
  });
});

test('columnar shape preserves __proto__ as a data property', () => {
  assert.deepEqual(jsonTextToTable(
    '{"__proto__":{"source":"api"},"year":[2024,2025]}',
    { shape: 'columnar' },
  ), {
    headers: ['/__proto__/source', '/year'],
    rows: [
      ['api', 2024],
      ['api', 2025],
    ],
  });
});

test('columnar shape flattens object elements after zipping', () => {
  assert.deepEqual(table({
    period: ['Q1', 'Q2'],
    metrics: [
      { revenue: 100, eps: 1.2 },
      { revenue: 120, eps: 1.4 },
    ],
  }, { shape: 'columnar' }), {
    headers: ['/metrics/eps', '/metrics/revenue', '/period'],
    rows: [
      [1.2, 100, 'Q1'],
      [1.4, 120, 'Q2'],
    ],
  });
});

test('columnar shape applies explicit projection after row construction', () => {
  assert.deepEqual(table({
    ticker: 'AAPL',
    year: [2024, 2025],
    eps: [6.08, 7.46],
  }, { shape: 'columnar', columns: ['/year', '/eps', '/ticker'] }), {
    headers: ['/year', '/eps', '/ticker'],
    rows: [
      [2024, 6.08, 'AAPL'],
      [2025, 7.46, 'AAPL'],
    ],
  });
});

test('columnar shape has no automatic schema when parallel arrays are empty', () => {
  assert.deepEqual(table({
    ticker: 'AAPL',
    year: [],
    eps: [],
  }, { shape: 'columnar' }), {
    headers: [],
    rows: [],
  });
});

test('columnar shape accepts multiple selected columnar records in selection order', () => {
  assert.deepEqual(table([
    { group: 'a', value: [1, 2] },
    { group: 'b', value: [3] },
  ], { shape: 'columnar' }), {
    headers: ['/group', '/value'],
    rows: [
      ['a', 1],
      ['a', 2],
      ['b', 3],
    ],
  });
});

test('columnar shape rejects invalid targets and unequal direct array lengths', () => {
  assert.throws(
    () => table({ value: 1 }, { shape: 'columnar' }),
    (error) => error.code === 'INVALID_COLUMNAR_TARGET',
  );
  assert.throws(
    () => table([1, 2], { query: '$', shape: 'columnar' }),
    (error) => error.code === 'INVALID_COLUMNAR_TARGET',
  );
  assert.throws(
    () => table({ year: [2024, 2025], eps: [6.08] }, { shape: 'columnar' }),
    (error) => error.code === 'COLUMN_LENGTH_MISMATCH',
  );
});
