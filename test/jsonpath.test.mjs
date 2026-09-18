import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { checkCase, checkSuite, equalJson } from './jsonpath/check.mjs';
import { createJSONPathEnvironment } from '../src/jsonpath.mjs';
import { TextEncoder as AppsScriptTextEncoder } from '../src/apps-script-text-encoder.mjs';

const ctsBytes = await readFile(new URL('./jsonpath/fixtures/cts.json', import.meta.url));
const { tests } = JSON.parse(ctsBytes);
const ctsSha256 = 'f0932266a108d7b927f9a3fcc56e857f96c2bcd65c2acc25b70f3666b1dce7c3';
const expectedCtsFailures = [
  {
    name: 'functions, match, explicit caret',
    selector: "$[?match(@, '^ab.*')]",
    reason: 'values or normalized paths differ',
  },
  {
    name: 'functions, match, explicit dollar',
    selector: "$[?match(@, '.*bc$')]",
    reason: 'values or normalized paths differ',
  },
];
const textEncoderShimPath = fileURLToPath(
  new URL('../src/apps-script-text-encoder.mjs', import.meta.url),
);

function select(document, selector) {
  const environment = createJSONPathEnvironment();
  return Array.from(environment.query(selector, document), (node) => ({
    value: node.value,
    path: node.getPath({ form: 'canonical' }),
  }));
}

async function buildForAppsScript(entryPoint, globalName) {
  const result = await build({
    entryPoints: [fileURLToPath(entryPoint)],
    bundle: true,
    write: false,
    platform: 'neutral',
    mainFields: ['module', 'main'],
    format: 'iife',
    globalName,
    target: 'es2020',
    legalComments: 'none',
    minify: false,
    inject: [textEncoderShimPath],
  });

  return result.outputFiles[0].text;
}

test('pinned CTS snapshot matches its documented checksum and case count', () => {
  assert.equal(createHash('sha256').update(ctsBytes).digest('hex'), ctsSha256);
  assert.equal(tests.length, 704);
});

test('harness preserves node-list order and multiplicity, ignores object member order', () => {
  assert.equal(equalJson([{ a: 1, b: 2 }], [{ b: 2, a: 1 }]), true);
  assert.equal(equalJson([1, 2], [2, 1]), false);
  assert.equal(equalJson([1, 1], [1]), false);
});

test('harness pairs each allowed value order with its corresponding paths', () => {
  const fixture = { selector: '$.*', document: { a: 1, b: 2 },
    results: [[1, 2], [2, 1]], results_paths: [["$['a']", "$['b']"], ["$['b']", "$['a']"]] };
  assert.equal(checkCase(() => [{ value: 2, path: "$['b']" }, { value: 1, path: "$['a']" }], fixture), null);
  assert.notEqual(checkCase(() => [{ value: 2, path: "$['a']" }, { value: 1, path: "$['b']" }], fixture), null);
});

test('harness fails on accepted invalid queries and errors from valid queries', () => {
  assert.notEqual(checkCase(() => [], { selector: '$[', invalid_selector: true }), null);
  assert.notEqual(checkCase(() => { throw new Error('error'); },
    { selector: '$', document: 1, result: [1], result_paths: ['$'] }), null);
});

test('public JSONPath environment matches pinned CTS except RFC 9485 anchor divergences', () => {
  const report = checkSuite(select, tests);
  assert.equal(report.passed, tests.length - expectedCtsFailures.length);
  assert.deepEqual(report.failures, expectedCtsFailures);
});

test('object ordering handles numeric-looking names and Unicode code points', () => {
  const data = { z: 'z', a: 'a', '2': 'two', '10': 'ten', '\u{10000}': 'astral', '\uE000': 'bmp' };
  assert.deepEqual(select(data, '$.*').map((node) => node.value),
    ['ten', 'two', 'a', 'z', 'bmp', 'astral']);
});

test('explicit selector order, reverse slices and duplicates survive deterministic ordering', () => {
  assert.deepEqual(select(['a', 'b', 'c'], '$[2,0,2]').map((node) => node.value), ['c', 'a', 'c']);
  assert.deepEqual(select([1, 2, 3], '$[::-1]').map((node) => node.value), [3, 2, 1]);
  assert.deepEqual(select({ a: 1, z: 2 }, "$['z','a','z']").map((node) => node.value), [2, 1, 2]);
});

test('invalid regex patterns are treated as no match', () => {
  assert.deepEqual(select(['value'], "$[?match(@, '[')]"), []);
  assert.deepEqual(select(['value'], "$[?search(@, '[')]"), []);
});

test('I-Regexp caret and dollar stay literal for match and search', () => {
  assert.deepEqual(select(['^ab', '^abx', 'ab'], "$[?match(@, '^ab')]").map((node) => node.value),
    ['^ab']);
  assert.deepEqual(select(['ab$', 'xab$', 'ab'], "$[?match(@, 'ab$')]").map((node) => node.value),
    ['ab$']);
  assert.deepEqual(select(['a^b', 'ab'], "$[?match(@, 'a^b')]").map((node) => node.value),
    ['a^b']);
  assert.deepEqual(select(['a$b', 'ab'], "$[?match(@, 'a$b')]").map((node) => node.value),
    ['a$b']);
  assert.deepEqual(select(['x^aby', 'ab at start', 'none'], "$[?search(@, '^ab')]").map((node) => node.value),
    ['x^aby']);
  assert.deepEqual(select(['xab$y', 'ends ab', 'none'], "$[?search(@, 'ab$')]").map((node) => node.value),
    ['xab$y']);
  assert.deepEqual(select(['a', 'b', '^'], "$[?match(@, '[^b]')]").map((node) => node.value),
    ['a', '^']);
});

test('Apps Script TextEncoder shim is limited to json-p3 hexadecimal parsing', async () => {
  const raw = await readFile(new URL('../node_modules/json-p3/dist/json-p3.esm.js', import.meta.url), 'utf8');
  assert.equal(raw.match(/new TextEncoder\(\)/g)?.length ?? 0, 1);
  assert.match(raw, /for \(const digit of encoder\.encode\(digits\)\) \{/);

  assert.deepEqual(Array.from(new AppsScriptTextEncoder().encode('09aAfF')), [48, 57, 97, 65, 102, 70]);
  assert.throws(() => new AppsScriptTextEncoder().encode('é'), /only supports ASCII/);
});

test('public JSONPath environment qualifies in an Apps Script-like bundle', async () => {
  const source = await buildForAppsScript(
    new URL('./jsonpath/apps-script.mjs', import.meta.url),
    'ImportJSONQualification',
  );

  assert.doesNotMatch(source, /__importJSONVisitNode|__importJSONCheckDeadline/);

  const context = createContext({ console: { log() {} } }, {
    codeGeneration: { strings: false, wasm: false },
  });
  runInContext(source, context, { timeout: 5000 });

  assert.equal(runInContext('typeof process + ":" + typeof require + ":" + typeof Buffer', context),
    'undefined:undefined:undefined');
  assert.equal(runInContext('typeof TextEncoder', context), 'undefined');

  const report = JSON.parse(runInContext(
    'JSON.stringify(ImportJSONQualification.smoke())', context, { timeout: 5000 },
  ));
  assert.equal(report.passed, tests.length - expectedCtsFailures.length);
  assert.deepEqual(report.failures, expectedCtsFailures);
  assert.equal(report.regexEngine, 're2js@2.8.6');
  assert.equal(report.textEncoderAvailable, false);
});

test('built production Library bundle supports public match/search overrides in an Apps Script-like runtime', async () => {
  const source = await readFile('build/importjson-library.gs', 'utf8');

  assert.doesNotMatch(source, /__importJSONVisitNode|__importJSONCheckDeadline/);

  const context = createContext({
    UrlFetchApp: {
      fetch() {
        return {
          getResponseCode() { return 200; },
          getContentText() {
            return '[{"name":"Alice","score":2},{"name":"Bob","score":1}]';
          },
        };
      },
    },
  }, {
    codeGeneration: { strings: false, wasm: false },
  });

  context.inputUrl = 'https://example.test/data.json';
  context.inputColumns = [['/name', '/score']];
  runInContext(source, context, { timeout: 5000 });

  assert.equal(runInContext('typeof IMPORTJSON', context), 'function');
  assert.equal(runInContext('typeof TextEncoder', context), 'undefined');

  context.inputQuery = "$[?match(@.name, 'A.*')]";
  const matchResult = JSON.parse(runInContext(
    'JSON.stringify(IMPORTJSON(inputUrl, inputQuery, inputColumns))',
    context,
    { timeout: 5000 },
  ));
  assert.deepEqual(matchResult, [
    ['/name', '/score'],
    ['Alice', 2],
  ]);

  context.inputQuery = "$[?search(@.name, 'ob')]";
  const searchResult = JSON.parse(runInContext(
    'JSON.stringify(IMPORTJSON(inputUrl, inputQuery, inputColumns))',
    context,
    { timeout: 5000 },
  ));
  assert.deepEqual(searchResult, [
    ['/name', '/score'],
    ['Bob', 1],
  ]);
});
