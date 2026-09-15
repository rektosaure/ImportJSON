import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

test('Apps Script library bundle exposes IMPORTJSON', async () => {
  const bundle = await readFile('build/importjson-library.gs', 'utf8');

  assert.match(bundle, /@customfunction/);
  assert.match(bundle, /function IMPORTJSON\(url, query, columns, shape, refreshKey\)/);
});

test('dist contains the small user-facing wrapper', async () => {
  const wrapper = await readFile('dist/ImportJSON.gs', 'utf8');

  assert.match(wrapper, /@customfunction/);
  assert.match(wrapper, /function IMPORTJSON\(url, query, columns, shape, refreshKey\)/);
  assert.match(wrapper, /ImportJSONLib\.IMPORTJSON/);
  assert.ok(Buffer.byteLength(wrapper, 'utf8') < 4096);
  assert.doesNotMatch(wrapper, /ImportJSONBundle|json-p3|re2js/);
});

test('build contains one consolidated third-party license file', async () => {
  assert.deepEqual((await readdir('build')).sort(), [
    'THIRD_PARTY_LICENSES.txt',
    'appsscript.json',
    'importjson-library.gs',
  ]);

  const licenses = await readFile('build/THIRD_PARTY_LICENSES.txt', 'utf8');
  assert.match(licenses, /===== json-p3 =====/);
  assert.match(licenses, /===== re2js =====/);
});
