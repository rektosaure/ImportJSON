import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

function replaceExactly(source, pattern, replacement, label, expected = 1) {
  const matches = source.match(pattern);
  if (!matches || matches.length !== expected) {
    throw new Error(`${label}: expected ${expected} match(es), found ${matches?.length ?? 0}`);
  }
  return source.replace(pattern, replacement);
}

function patchWithoutBudgets(source) {
  let patched = `import { RE2JS } from "re2js";\n${source}`;

  patched = replaceExactly(
    patched,
    /const encoder = new TextEncoder\(\);\s*let codepoint = 0;\s*for \(const digit of encoder\.encode\(digits\)\) \{/g,
    `let codepoint = 0;\n    for (let i = 0; i < digits.length; i++) {\n      const digit = digits.charCodeAt(i);`,
    'remove TextEncoder from hex parsing',
  );

  patched = replaceExactly(
    patched,
    /function fullMatch\(pattern\) \{/g,
    `function mapRE2Regexp(pattern) {\n  let escaped = false;\n  let charClass = false;\n  const parts = [];\n  for (const ch of pattern) {\n    if (escaped) {\n      parts.push(ch);\n      escaped = false;\n      continue;\n    }\n    if (ch === "\\\\") {\n      escaped = true;\n      parts.push(ch);\n      continue;\n    }\n    if (ch === "[") {\n      charClass = true;\n      parts.push(ch);\n      continue;\n    }\n    if (ch === "]") {\n      charClass = false;\n      parts.push(ch);\n      continue;\n    }\n    parts.push(ch === "." && !charClass ? "[^\\\\n\\\\r]" : ch);\n  }\n  return parts.join("");\n}\n\nfunction fullMatchRE2(pattern) {\n  const parts = [];\n  const explicitCaret = pattern.startsWith("^");\n  const explicitDollar = pattern.endsWith("$");\n  if (!explicitCaret && !explicitDollar) parts.push("^(?:");\n  parts.push(mapRE2Regexp(pattern));\n  if (!explicitCaret && !explicitDollar) parts.push(")$");\n  return parts.join("");\n}\n\nfunction fullMatch(pattern) {`,
    'add RE2 I-Regexp mapping',
  );

  patched = replaceExactly(
    patched,
    /const re = new RegExp\(fullMatch\(pattern\), "u"\);/g,
    'const re = RE2JS.compile(fullMatchRE2(pattern));',
    'use RE2JS for match()',
  );

  patched = replaceExactly(
    patched,
    /const re = new RegExp\(mapRegexp\(pattern\), "u"\);/g,
    'const re = RE2JS.compile(mapRE2Regexp(pattern));',
    'use RE2JS for search()',
  );

  patched = replaceExactly(
    patched,
    /return !!s\.match\(re\);/g,
    'return re.test(s);',
    'use RE2JS search execution',
    2,
  );

  return patched;
}

async function buildWithPatch(entryPoint, globalName) {
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
    plugins: [{
      name: 'json-p3-no-budget-spike',
      setup(buildContext) {
        buildContext.onLoad({ filter: /[/\\]json-p3[/\\]dist[/\\]json-p3\.esm\.js$/ }, async ({ path }) => ({
          contents: patchWithoutBudgets(await readFile(path, 'utf8')),
          loader: 'js',
        }));
      },
    }],
  });

  return result.outputFiles[0].text;
}

test('qualification passes without lazy traversal and budget instrumentation patches', async () => {
  const source = await buildWithPatch(
    new URL('./jsonpath/apps-script.mjs', import.meta.url),
    'ImportJSONQualification',
  );

  assert.doesNotMatch(source, /__importJSONVisitNode/);
  assert.doesNotMatch(source, /__importJSONCheckDeadline/);
  assert.doesNotMatch(source, /selector\.lazyResolve/);

  const context = createContext({ console: { log() {} } }, {
    codeGeneration: { strings: false, wasm: false },
  });
  runInContext(source, context, { timeout: 5000 });

  const report = JSON.parse(runInContext(
    'JSON.stringify(ImportJSONQualification.smoke())', context, { timeout: 5000 },
  ));

  assert.equal(report.compliance.passed, 704);
  assert.equal(report.orderedCompliance.passed, 704);
  assert.deepEqual(report.compliance.failures, []);
  assert.deepEqual(report.orderedCompliance.failures, []);
  assert.equal(report.selectionPassed, true);
  assert.equal(report.textEncoderAvailable, false);
  assert.equal(report.laziness.readsBeforeFirstReturn, 1000);
  assert.equal(report.budgets.nodeBudgetExceeded, false);
  assert.equal(report.budgets.deadlineExceeded, false);
});

test('production adapter bundle works without traversal-budget instrumentation', async () => {
  const source = await buildWithPatch(
    new URL('../src/apps-script.mjs', import.meta.url),
    'SpikeBundle',
  );

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
  context.inputQuery = "$[?match(@.name, 'A.*')]";
  context.inputColumns = [['/name', '/score']];

  runInContext(source, context, { timeout: 5000 });
  const result = JSON.parse(runInContext(
    'JSON.stringify(SpikeBundle.runImportJSON(inputUrl, inputQuery, inputColumns))',
    context,
    { timeout: 5000 },
  ));

  assert.deepEqual(result, [
    ['/name', '/score'],
    ['Alice', 2],
  ]);
});
