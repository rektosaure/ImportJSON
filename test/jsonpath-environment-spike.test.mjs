import test from 'node:test';
import assert from 'node:assert/strict';
import suite from './jsonpath/fixtures/cts.json' with { type: 'json' };
import { checkSuite } from './jsonpath/check.mjs';
import { createJSONPathEnvironment } from '../src/jsonpath.mjs';

function select(document, selector) {
  const environment = createJSONPathEnvironment();
  return Array.from(environment.query(selector, document), (node) => ({
    value: node.value,
    path: node.getPath({ form: 'canonical' }),
  }));
}

test('public JSONPath environment passes the complete pinned CTS', () => {
  assert.deepEqual(checkSuite(select, suite.tests).failures, []);
});

test('public JSONPath environment treats invalid regex patterns as no match', () => {
  const environment = createJSONPathEnvironment();
  const result = Array.from(environment.query("$[?match(@, '[')]", ['value']));
  assert.deepEqual(result, []);
});
