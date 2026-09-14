import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSONPathEnvironment } from 'json-p3';
import { checkCase, checkSuite, equalJson } from './jsonpath/check.mjs';
import { jsonP3, orderedSelect, budgetObservations, lazinessObservations } from './jsonpath/p3-probes.mjs';
import { patchJsonP3 } from '../src/json-p3-patch.mjs';

const ctsBytes = await readFile(new URL('./jsonpath/fixtures/cts.json', import.meta.url));
const { tests } = JSON.parse(ctsBytes);
const ctsSha256 = 'f0932266a108d7b927f9a3fcc56e857f96c2bcd65c2acc25b70f3666b1dce7c3';

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

test('json-p3 passes the complete pinned CTS', () => {
  assert.deepEqual(checkSuite(jsonP3, tests).failures, []);
});

test('ordering through the documented entries hook still passes the complete CTS', () => {
  assert.deepEqual(checkSuite(orderedSelect, tests).failures, []);
});

test('object ordering handles numeric-looking names and Unicode code points', () => {
  const data = { z: 'z', a: 'a', '2': 'two', '10': 'ten', '\u{10000}': 'astral', '\uE000': 'bmp' };
  assert.deepEqual(orderedSelect(data, '$.*').map((node) => node.value),
    ['ten', 'two', 'a', 'z', 'bmp', 'astral']);
});

test('explicit selector order, reverse slices and duplicates survive ordering', () => {
  assert.deepEqual(orderedSelect(['a', 'b', 'c'], '$[2,0,2]').map((n) => n.value), ['c', 'a', 'c']);
  assert.deepEqual(orderedSelect([1, 2, 3], '$[::-1]').map((n) => n.value), [3, 2, 1]);
  assert.deepEqual(orderedSelect({ a: 1, z: 2 }, "$['z','a','z']").map((n) => n.value), [2, 1, 2]);
});

test('a final-match consumer can throw without returning a partial result', () => {
  const environment = new JSONPathEnvironment();
  const limit = new Error('probe match budget exceeded');
  let returned;
  assert.throws(() => {
    const values = [];
    for (const node of environment.lazyQuery('$[*]', [1, 2, 3])) {
      if (values.length === 2) throw limit;
      values.push(node.value);
    }
    returned = values;
  }, (error) => error === limit);
  assert.equal(returned, undefined);
});

test('raw json-p3 still reproduces the lazy traversal and budget gaps', () => {
  assert.deepEqual(lazinessObservations(), {
    firstDone: false, firstValue: 0, readsBeforeFirstReturn: 1000,
  });
  assert.deepEqual(budgetObservations(), {
    noMatchDone: true,
    visitedBeforeFirstReturn: 1000,
    noMatchEntriesCalls: 0,
    nodeBudgetExceeded: false,
    nodesVisited: 0,
    selectorBudgets: {
      name: { exceeded: false, nodesVisited: 0 },
      index: { exceeded: false, nodesVisited: 0 },
      slice: { exceeded: false, nodesVisited: 0 },
      wildcard: { exceeded: false, nodesVisited: 0 },
      descendant: { exceeded: false, nodesVisited: 0 },
    },
    objectOrderDeadlineExceeded: true,
    objectOrderDeadlineChecks: 1,
    deadlineExceeded: false,
    deadlineChecks: 0,
    depthRejected: true,
  });
});

test('ImportJSON patch applies exactly to the pinned json-p3 bundle', async () => {
  const raw = await readFile(new URL('../node_modules/json-p3/dist/json-p3.esm.js', import.meta.url), 'utf8');
  assert.match(raw, /new TextEncoder\(\)/);
  assert.match(raw, /new RegExp\(fullMatch\(pattern\), "u"\)/);
  assert.match(raw, /return !!s\.match\(re\);/);
  const patched = patchJsonP3(raw);
  assert.doesNotMatch(patched, /new TextEncoder\(\)/);
  assert.match(patched, /import \{ RE2JS \} from "re2js";/);
  assert.match(patched, /RE2JS\.compile\(fullMatchRE2\(pattern\)\)/);
  assert.match(patched, /RE2JS\.compile\(mapRE2Regexp\(pattern\)\)/);
  assert.doesNotMatch(patched, /new RegExp\(fullMatch\(pattern\), "u"\)/);
  assert.doesNotMatch(patched, /return !!s\.match\(re\);/);
  assert.match(patched, /__importJSONVisitNode/);
  assert.match(patched, /__importJSONCheckDeadline/);
  assert.match(patched, /selector\.lazyResolve/);
});

test('patched bundle passes compliance without Node runtime globals', async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('./jsonpath/apps-script.mjs', import.meta.url))],
    bundle: true,
    write: false,
    platform: 'neutral',
    mainFields: ['module', 'main'],
    format: 'iife',
    globalName: 'ImportJSONQualification',
    target: 'es2020',
    legalComments: 'none',
    minify: false,
    plugins: [{
      name: 'json-p3-importjson-patch-test',
      setup(buildContext) {
        buildContext.onLoad({ filter: /[/\\]json-p3[/\\]dist[/\\]json-p3\.esm\.js$/ }, async ({ path }) => ({
          contents: patchJsonP3(await readFile(path, 'utf8')),
          loader: 'js',
        }));
      },
    }],
  });

  const source = result.outputFiles[0].text;
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
  assert.equal(report.compliance.passed, 704);
  assert.equal(report.orderedCompliance.passed, 704);
  assert.equal(report.compliance.failures.length, 0);
  assert.equal(report.orderedCompliance.failures.length, 0);
  assert.equal(report.regexEngine, 're2js@2.8.6');
  assert.equal(report.textEncoderAvailable, false);
  assert.equal(report.selectionPassed, true);
  assert.deepEqual(report.laziness, { firstDone: false, firstValue: 0, readsBeforeFirstReturn: 1 });
  assert.equal(report.budgets.nodeBudgetExceeded, true);
  assert.equal(report.budgets.nodesVisited, 100);
  assert.equal(report.budgets.deadlineExceeded, true);
  assert.equal(report.budgets.depthRejected, true);
  assert.equal('productionQualified' in report, false);
});
