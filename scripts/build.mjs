import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

await rm('build', { recursive: true, force: true });
await mkdir('build', { recursive: true });

await build({
  entryPoints: ['src/apps-script.mjs'],
  bundle: true,
  platform: 'neutral',
  mainFields: ['module', 'main'],
  format: 'iife',
  globalName: 'ImportJSONBundle',
  target: 'es2020',
  legalComments: 'eof',
  minify: true,
  outfile: 'build/importjson-library.gs',
  inject: ['src/apps-script-text-encoder.mjs'],
  footer: { js: await readFile('src/apps-script-globals.js', 'utf8') },
});

await writeFile('build/appsscript.json', JSON.stringify({
  timeZone: 'Etc/UTC', runtimeVersion: 'V8', exceptionLogging: 'STACKDRIVER',
}, null, 2) + '\n');

const thirdPartyLicenses = [
  ['json-p3', await readFile('node_modules/json-p3/LICENCE', 'utf8')],
  ['re2js', await readFile('node_modules/re2js/LICENSE', 'utf8')],
];

await writeFile(
  'build/THIRD_PARTY_LICENSES.txt',
  thirdPartyLicenses
    .map(([name, license]) => `===== ${name} =====\n\n${license.trim()}\n`)
    .join('\n'),
);
