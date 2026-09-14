import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { patchJsonP3 } from '../src/json-p3-patch.mjs';

await mkdir('build', { recursive: true });

const jsonP3Patch = {
  name: 'json-p3-importjson-patch',
  setup(buildContext) {
    buildContext.onLoad({ filter: /[/\\]json-p3[/\\]dist[/\\]json-p3\.esm\.js$/ }, async ({ path }) => ({
      contents: patchJsonP3(await readFile(path, 'utf8')),
      loader: 'js',
    }));
  },
};

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
  plugins: [jsonP3Patch],
  footer: { js: await readFile('src/apps-script-globals.js', 'utf8') },
});

await writeFile('build/appsscript.json', JSON.stringify({
  timeZone: 'Etc/UTC', runtimeVersion: 'V8', exceptionLogging: 'STACKDRIVER',
}, null, 2) + '\n');
await copyFile('node_modules/json-p3/LICENCE', 'build/json-p3-LICENSE');
await copyFile('node_modules/re2js/LICENSE', 'build/re2js-LICENSE');
