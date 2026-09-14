import { JSONPathEnvironment, jsonpath } from 'json-p3';

export function jsonP3(document, selector) {
  return Array.from(jsonpath.query(selector, document), (node) => ({
    value: node.value, path: node.getPath({ form: 'canonical' }),
  }));
}

// A qualification probe of the documented entries hook, not a production adapter.
export function orderedEnvironment() {
  const environment = new JSONPathEnvironment();
  environment.entries = (object) => Object.entries(object).sort(([a], [b]) => {
    if (typeof environment.__importJSONCheckDeadline === 'function') {
      environment.__importJSONCheckDeadline();
    }
    const left = Array.from(a, (ch) => ch.codePointAt(0));
    const right = Array.from(b, (ch) => ch.codePointAt(0));
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      if (left[i] !== right[i]) return left[i] - right[i];
    }
    return left.length - right.length;
  });
  return environment;
}

export function orderedSelect(document, selector) {
  return Array.from(orderedEnvironment().query(selector, document), (node) => ({
    value: node.value,
    path: node.getPath({ form: 'canonical' }),
  }));
}

function installQualificationBudget(environment, {
  maxNodesVisited = Infinity,
  deadline = Infinity,
  now = Date.now,
} = {}) {
  const nodeLimit = new Error('probe node budget exceeded');
  const deadlineLimit = new Error('probe deadline exceeded');
  let nodesVisited = 0;
  let deadlineChecks = 0;

  environment.__importJSONVisitNode = () => {
    if (nodesVisited >= maxNodesVisited) throw nodeLimit;
    nodesVisited++;
  };

  environment.__importJSONCheckDeadline = () => {
    deadlineChecks++;
    if (now() > deadline) throw deadlineLimit;
  };

  return {
    nodeLimit,
    deadlineLimit,
    get nodesVisited() { return nodesVisited; },
    get deadlineChecks() { return deadlineChecks; },
  };
}

function observeNodeBudget(selector, document, maxNodesVisited) {
  const environment = new JSONPathEnvironment();
  const budget = installQualificationBudget(environment, { maxNodesVisited });
  let exceeded = false;
  try {
    Array.from(environment.lazyQuery(selector, document));
  } catch (error) {
    exceeded = error === budget.nodeLimit;
    if (!exceeded) throw error;
  }
  return { exceeded, nodesVisited: budget.nodesVisited };
}

export function lazinessObservations() {
  const environment = orderedEnvironment();
  let reads = 0;
  const document = new Array(1000);
  for (let i = 0; i < document.length; i++) {
    Object.defineProperty(document, i, {
      enumerable: true,
      configurable: true,
      get() { reads++; return i; },
    });
  }

  const first = environment.lazyQuery('$[0:1000]', document).next();
  return { firstDone: first.done, firstValue: first.value?.value, readsBeforeFirstReturn: reads };
}

export function budgetObservations() {
  const environment = new JSONPathEnvironment();
  let entriesCalls = 0;
  const entries = environment.entries.bind(environment);
  environment.entries = (object) => {
    entriesCalls++;
    return entries(object);
  };

  // Accessors are instrumentation in this probe, not supported product inputs.
  let visited = 0;
  const document = Array.from({ length: 1000 }, () => ({
    get value() { visited++; return 0; },
  }));
  const budget = installQualificationBudget(environment, { maxNodesVisited: 100 });
  let noMatchDone = null;
  let nodeBudgetExceeded = false;
  try {
    noMatchDone = environment.lazyQuery('$[?@.value == 1]', document).next().done;
  } catch (error) {
    nodeBudgetExceeded = error === budget.nodeLimit;
    if (!nodeBudgetExceeded) throw error;
  }
  const noMatchEntriesCalls = entriesCalls;

  const selectorBudgets = {
    // Name and index selectors perform constant-time direct lookup and do not
    // consume the traversal counter. Variable-width selectors do.
    name: observeNodeBudget("$['a']", { a: 1 }, 0),
    index: observeNodeBudget('$[0]', [1], 0),
    slice: observeNodeBudget('$[0:3]', [1, 2, 3], 2),
    wildcard: observeNodeBudget('$[*]', [1, 2, 3], 2),
    descendant: observeNodeBudget('$..*', { a: { b: 1 } }, 2),
  };

  const orderEnvironment = orderedEnvironment();
  const orderBudget = installQualificationBudget(orderEnvironment, {
    deadline: 0,
    now: () => 1,
  });
  let objectOrderDeadlineExceeded = false;
  try {
    Array.from(orderEnvironment.lazyQuery('$.*', { b: 2, a: 1 }));
  } catch (error) {
    objectOrderDeadlineExceeded = error === orderBudget.deadlineLimit;
    if (!objectOrderDeadlineExceeded) throw error;
  }

  const depthEnvironment = new JSONPathEnvironment({ maxRecursionDepth: 3 });
  let depthRejected = false;
  try {
    Array.from(depthEnvironment.lazyQuery('$..*', { a: { b: { c: 1 } } }));
  } catch (error) {
    depthRejected = error.constructor.name === 'JSONPathRecursionLimitError';
    if (!depthRejected) throw error;
  }

  const deadlineEnvironment = new JSONPathEnvironment();
  let tick = 0;
  const deadlineBudget = installQualificationBudget(deadlineEnvironment, {
    deadline: 5,
    now: () => ++tick,
  });
  let deadlineExceeded = false;
  try {
    deadlineEnvironment.lazyQuery('$[?@.value == 1]', [{ value: 0 }, { value: 0 }, { value: 0 }, { value: 0 }]).next();
  } catch (error) {
    deadlineExceeded = error === deadlineBudget.deadlineLimit;
    if (!deadlineExceeded) throw error;
  }

  return {
    noMatchDone,
    visitedBeforeFirstReturn: visited,
    noMatchEntriesCalls,
    nodeBudgetExceeded,
    nodesVisited: budget.nodesVisited,
    selectorBudgets,
    objectOrderDeadlineExceeded,
    objectOrderDeadlineChecks: orderBudget.deadlineChecks,
    deadlineExceeded,
    deadlineChecks: deadlineBudget.deadlineChecks,
    depthRejected,
  };
}
