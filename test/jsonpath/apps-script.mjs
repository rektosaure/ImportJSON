import { checkSuite } from './check.mjs';
import { jsonP3, orderedSelect, budgetObservations, lazinessObservations } from './p3-probes.mjs';
import suite from './fixtures/cts.json' with { type: 'json' };

export function smoke() {
  const compliance = checkSuite(jsonP3, suite.tests);
  const orderedCompliance = checkSuite(orderedSelect, suite.tests);
  const order = orderedSelect({ '2': 2, '10': 10, z: 3, a: 4 }, '$.*').map((node) => node.value);
  const duplicateOrder = orderedSelect(['a', 'b', 'c'], '$[2,0,2]').map((node) => node.value);
  const selectionPassed = compliance.failures.length === 0 && orderedCompliance.failures.length === 0 &&
    JSON.stringify(order) === '[10,2,4,3]' && JSON.stringify(duplicateOrder) === '["c","a","c"]';
  return { engine: 'json-p3@2.3.0 + qualification patch', regexEngine: 're2js@2.8.6',
    compliance, orderedCompliance, order, duplicateOrder, selectionPassed,
    textEncoderAvailable: typeof TextEncoder !== 'undefined', laziness: lazinessObservations(),
    budgets: budgetObservations() };
}
