import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

function patchTextEncoderOnly(source) {
  const pattern = /const encoder = new TextEncoder\(\);\s*let codepoint = 0;\s*for \(const digit of encoder\.encode\(digits\)\) \{/g;
  const matches = source.match(pattern);
  if (!matches || matches.length !== 1) {
    throw new Error(`TextEncoder patch expected 1 match, found ${matches?.length ?? 0}`);
  }

  return source.replace(
    pattern,
    `let codepoint = 0;\n    for (let i = 0; i < digits.length; i++) {\n      const digit = digits.charCodeAt(i);`,
  );
}

async function buildWithTextEncoderPatch(entryPoint, globalName) {
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
      name: 'json-p3-textencoder-only-spike',
      setup(buildContext) {
        buildContext.onLoad({ filter: /[/\\]json-p3[/\\]dist[/\\]json-p3\.esm\.js$/ }, async ({ path }) => ({
          contents: patchTextEncoderOnly(await readFile(path, 'utf8')),
          loader: 'js',
        }));
      },
    }],
  });

  return result.outputFiles[0].text;
}

test('public JSONPath environment passes the full CTS with only the TextEncoder source patch', async () => {
  const source = await buildWithTextEncoderPatch(
    new URL('./jsonpath/public-environment-apps-script.mjs', import.meta.url),
    'ImportJSONQualification',
  );

  assert.doesNotMatch(source, /__importJSONVisitNode/);
  assert.doesNotMatch(source, /__importJSONCheckDeadline/);

  const context = createContext({ console: { log() {} } }, {
    codeGeneration: { strings: false, wasm: false },
  });
  runInContext(source, context, { timeout: 5000 });

  const report = JSON.parse(runInContext(
    'JSON.stringify(ImportJSONQualification.smoke())', context, { timeout: 5000 },
  ));

  assert.equal(report.passed, 704);
  assert.deepEqual(report.failures, []);
  assert.equal(report.textEncoderAvailable, false);
  assert.equal(runInContext('typeof process + ":" + typeof require + ":" + typeof Buffer', context),
    'undefined:undefined:undefined');
});

test('production adapter works with public match/search overrides and no traversal patch', async () => {
  const source = await buildWithTextEncoderPatch(
    new URL('../src/apps-script.mjs', import.meta.url),
    'SpikeBundle',
  );

  assert.doesNotMatch(source, /__importJSONVisitNode/);
  assert.doesNotMatch(source, /__importJSONCheckDeadline/);

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

  context.inputQuery = "$[?match(@.name, 'A.*')]";
  const matchResult = JSON.parse(runInContext(
    'JSON.stringify(SpikeBundle.runImportJSON(inputUrl, inputQuery, inputColumns))',
    context,
    { timeout: 5000 },
  ));
  assert.deepEqual(matchResult, [
    ['/name', '/score'],
    ['Alice', 2],
  ]);

  context.inputQuery = "$[?search(@.name, 'ob')]";
  const searchResult = JSON.parse(runInContext(
    'JSON.stringify(SpikeBundle.runImportJSON(inputUrl, inputQuery, inputColumns))',
    context,
    { timeout: 5000 },
  ));
  assert.deepEqual(searchResult, [
    ['/name', '/score'],
    ['Bob', 1],
  ]);
});
