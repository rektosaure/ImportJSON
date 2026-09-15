import cts from './fixtures/cts.json' with { type: 'json' };
import { createJSONPathEnvironment } from '../../src/jsonpath.mjs';
import { checkSuite } from './check.mjs';

function select(document, selector) {
  const environment = createJSONPathEnvironment();
  return Array.from(environment.query(selector, document), (node) => ({
    value: node.value,
    path: node.getPath({ form: 'canonical' }),
  }));
}

export function smoke() {
  const report = checkSuite(select, cts.tests);
  return {
    passed: cts.tests.length - report.failures.length,
    failures: report.failures,
    textEncoderAvailable: typeof TextEncoder !== 'undefined',
  };
}
