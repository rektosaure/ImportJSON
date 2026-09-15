import suite from './fixtures/cts.json' with { type: 'json' };
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
  const report = checkSuite(select, suite.tests);
  return {
    passed: suite.tests.length - report.failures.length,
    failures: report.failures,
    regexEngine: 're2js@2.8.6',
    textEncoderAvailable: typeof TextEncoder !== 'undefined',
  };
}
