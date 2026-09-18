// Object member order is immaterial to JSON equality; node-list order is not.
export function equalJson(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) =>
    Object.hasOwn(b, key) && equalJson(a[key], b[key]));
}

export function checkCase(select, fixture) {
  let nodes;
  try {
    nodes = select(fixture.document ?? null, fixture.selector);
  } catch (error) {
    return fixture.invalid_selector ? null : `unexpected error: ${error.message}`;
  }
  if (fixture.invalid_selector) return 'invalid selector accepted';
  const alternatives = fixture.results ?? [fixture.result];
  const paths = fixture.results_paths ?? [fixture.result_paths];
  const values = nodes.map((node) => node.value);
  const actualPaths = nodes.map((node) => node.path);
  return alternatives.some((expected, i) =>
    equalJson(values, expected) && equalJson(actualPaths, paths[i]))
    ? null : 'values or normalized paths differ';
}

export function checkSuite(select, fixtures) {
  const failures = [];
  for (const fixture of fixtures) {
    const reason = checkCase(select, fixture);
    if (reason) failures.push({ name: fixture.name, selector: fixture.selector, reason });
  }
  return { total: fixtures.length, passed: fixtures.length - failures.length, failures };
}
