import { createJSONPathEnvironment } from './jsonpath.mjs';
import { LIMITS } from './limits.mjs';

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function compareUnicodeCodePoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0));
  const rightPoints = Array.from(right, (character) => character.codePointAt(0));
  const length = Math.min(leftPoints.length, rightPoints.length);

  for (let index = 0; index < length; index++) {
    if (leftPoints[index] !== rightPoints[index]) {
      return leftPoints[index] - rightPoints[index];
    }
  }

  return leftPoints.length - rightPoints.length;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertMaxDepth(document) {
  if (document === null || typeof document !== 'object') return;

  const stack = [{ value: document, depth: 1 }];

  while (stack.length > 0) {
    const { value, depth } = stack.pop();

    if (depth > LIMITS.maxDepth) {
      fail('LIMIT_EXCEEDED', `JSON nesting exceeds ${LIMITS.maxDepth} levels`);
    }

    const children = Array.isArray(value) ? value : Object.values(value);
    for (const child of children) {
      if (child !== null && typeof child === 'object') {
        stack.push({ value: child, depth: depth + 1 });
      }
    }
  }
}

function assertMaxRows(rowCount) {
  if (rowCount > LIMITS.maxRows) {
    fail('LIMIT_EXCEEDED', `result exceeds ${LIMITS.maxRows} rows`);
  }
}

function assertCanAppendRows(currentCount, additionalCount) {
  if (additionalCount > LIMITS.maxRows - currentCount) {
    fail('LIMIT_EXCEEDED', `result exceeds ${LIMITS.maxRows} rows`);
  }
}

function assertMaxColumns(columnCount) {
  if (columnCount > LIMITS.maxColumns) {
    fail('LIMIT_EXCEEDED', `result exceeds ${LIMITS.maxColumns} columns`);
  }
}

function assertMaxCells(rowCount, columnCount) {
  if (columnCount === 0) return;

  const renderedRowCount = rowCount + 1;
  if (renderedRowCount > Math.floor(LIMITS.maxCells / columnCount)) {
    fail('LIMIT_EXCEEDED', `result exceeds ${LIMITS.maxCells} cells`);
  }
}

function escapePointerToken(token) {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

function parsePointer(pointer, name) {
  if (typeof pointer !== 'string' || pointer.length === 0 || pointer[0] !== '/') {
    fail('INVALID_ARGUMENT', `${name} must be a non-empty JSON Pointer`);
  }

  return pointer.slice(1).split('/').map((token) => {
    let decoded = '';

    for (let index = 0; index < token.length; index++) {
      if (token[index] !== '~') {
        decoded += token[index];
        continue;
      }

      const escape = token[++index];
      if (escape === '0') decoded += '~';
      else if (escape === '1') decoded += '/';
      else fail('INVALID_ARGUMENT', `${name} contains an invalid JSON Pointer`);
    }

    return decoded;
  });
}

function resolvePointer(record, tokens) {
  let value = record;

  for (const token of tokens) {
    if (Array.isArray(value)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) return undefined;
      const index = Number(token);
      if (!Number.isSafeInteger(index) || index >= value.length) return undefined;
      value = value[index];
      continue;
    }

    if (!isObject(value) || !Object.prototype.hasOwnProperty.call(value, token)) {
      return undefined;
    }

    value = value[token];
  }

  return value;
}

function replacePointer(value, tokens, replacement) {
  if (tokens.length === 0) return replacement;

  const [token, ...rest] = tokens;

  if (Array.isArray(value)) {
    const index = Number(token);
    const copy = value.slice();
    copy[index] = replacePointer(value[index], rest, replacement);
    return copy;
  }

  return {
    ...value,
    [token]: replacePointer(value[token], rest, replacement),
  };
}

function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }

  if (isObject(value)) {
    const keys = Object.keys(value).sort(compareUnicodeCodePoints);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

function cellValue(value) {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value) || isObject(value)) return canonicalStringify(value);
  return value;
}

function addAutomaticValue(output, headers, pointer, value) {
  if (!headers.has(pointer)) {
    if (headers.size >= LIMITS.maxColumns) {
      fail('LIMIT_EXCEEDED', `result exceeds ${LIMITS.maxColumns} columns`);
    }
    headers.add(pointer);
  }

  output.set(pointer, cellValue(value));
}

function flattenObject(value, pointer, output, headers) {
  for (const key of Object.keys(value)) {
    const child = value[key];
    const childPointer = `${pointer}/${escapePointerToken(key)}`;

    if (isObject(child)) flattenObject(child, childPointer, output, headers);
    else addAutomaticValue(output, headers, childPointer, child);
  }
}

function selectNodes(document, query) {
  if (query === undefined) {
    if (Array.isArray(document)) {
      assertMaxRows(document.length);
      return document.map((value, index) => ({ value, location: [index] }));
    }
    return [{ value: document, location: [] }];
  }

  if (typeof query !== 'string' || query.length === 0) {
    fail('INVALID_ARGUMENT', 'query must be a non-empty JSONPath string');
  }

  const environment = createJSONPathEnvironment();

  try {
    const nodes = [];
    for (const node of environment.query(query, document)) {
      assertCanAppendRows(nodes.length, 1);
      nodes.push({ value: node.value, location: node.location });
    }
    return nodes;
  } catch (error) {
    if (error?.code === 'LIMIT_EXCEEDED') throw error;
    fail('INVALID_JSONPATH', 'query is not a valid JSONPath expression');
  }
}

function expandRecords(records, shape) {
  const tokens = parsePointer(shape, 'shape');
  const shapedRecords = [];

  for (const record of records) {
    const target = resolvePointer(record, tokens);

    if (target === undefined || target === null) {
      assertCanAppendRows(shapedRecords.length, 1);
      shapedRecords.push(record);
      continue;
    }

    if (!Array.isArray(target)) {
      fail('INVALID_EXPANSION_TARGET', 'shape JSON Pointer must resolve to an array, null, or a missing value');
    }

    assertCanAppendRows(shapedRecords.length, target.length);
    for (const element of target) {
      shapedRecords.push(replacePointer(record, tokens, element));
    }
  }

  return shapedRecords;
}

function combineRecords(nodes) {
  if (nodes.length === 0) return [];

  const firstLocation = nodes[0].location;
  if (firstLocation.length === 0 || typeof firstLocation[firstLocation.length - 1] !== 'string') {
    fail('INVALID_COMBINE_TARGET', 'combine shape requires selected sibling object members');
  }

  const parentLocation = firstLocation.slice(0, -1);
  const entries = [];
  const keys = new Set();

  for (const { value, location } of nodes) {
    const key = location[location.length - 1];
    const sameParent = location.length === parentLocation.length + 1
      && parentLocation.every((part, index) => location[index] === part);

    if (typeof key !== 'string' || !sameParent) {
      fail('INVALID_COMBINE_TARGET', 'combine shape requires selected sibling object members');
    }
    if (keys.has(key)) {
      fail('COMBINE_CONFLICT', `combine shape selected duplicate member ${JSON.stringify(key)}`);
    }

    keys.add(key);
    entries.push([key, value]);
  }

  return [Object.fromEntries(entries)];
}

function columnarizeRecords(records) {
  const shapedRecords = [];

  for (const record of records) {
    if (!isObject(record)) {
      fail('INVALID_COLUMNAR_TARGET', 'columnar shape requires selected records to be objects');
    }

    const entries = Object.entries(record);
    const arrayEntries = entries.filter(([, value]) => Array.isArray(value));

    if (arrayEntries.length === 0) {
      fail('INVALID_COLUMNAR_TARGET', 'columnar shape requires at least one direct array property');
    }

    const rowCount = arrayEntries[0][1].length;
    if (arrayEntries.some(([, value]) => value.length !== rowCount)) {
      fail('COLUMN_LENGTH_MISMATCH', 'columnar arrays must have the same length within each selected record');
    }

    assertCanAppendRows(shapedRecords.length, rowCount);
    for (let index = 0; index < rowCount; index++) {
      const shapedRecord = Object.fromEntries(entries.map(([key, value]) => [
        key,
        Array.isArray(value) ? value[index] : value,
      ]));
      shapedRecords.push(shapedRecord);
    }
  }

  return shapedRecords;
}

function shapeRecords(nodes, shape) {
  if (shape === 'combine') return combineRecords(nodes);

  const records = nodes.map(({ value }) => value);
  if (shape === undefined) return records;
  if (shape === 'columnar') return columnarizeRecords(records);
  return expandRecords(records, shape);
}

function tabularizeRecords(records, columns) {
  if (columns !== undefined) {
    if (!Array.isArray(columns) || columns.length === 0) {
      fail('INVALID_ARGUMENT', 'columns must be a non-empty list of JSON Pointers');
    }

    assertMaxColumns(columns.length);
    assertMaxCells(records.length, columns.length);

    const seen = new Set();
    const parsed = columns.map((pointer) => {
      if (seen.has(pointer)) {
        fail('INVALID_ARGUMENT', 'columns must not contain duplicates');
      }
      seen.add(pointer);
      return { pointer, tokens: parsePointer(pointer, 'column') };
    });

    return {
      headers: parsed.map(({ pointer }) => pointer),
      rows: records.map((record) => parsed.map(({ tokens }) => cellValue(resolvePointer(record, tokens)))),
    };
  }

  const headerSet = new Set();
  const flattened = records.map((record) => {
    const values = new Map();

    if (isObject(record)) flattenObject(record, '', values, headerSet);
    else addAutomaticValue(values, headerSet, '@value', record);

    return values;
  });

  const headers = [...headerSet].sort(compareUnicodeCodePoints);
  assertMaxCells(records.length, headers.length);

  return {
    headers,
    rows: flattened.map((values) => headers.map((header) => values.get(header))),
  };
}

export function jsonTextToTable(body, { query, columns, shape } = {}) {
  let document;

  try {
    if (typeof body !== 'string') throw new TypeError('body must be text');
    document = JSON.parse(body);
  } catch {
    fail('INVALID_JSON', 'response body is not valid JSON');
  }

  assertMaxDepth(document);
  const selection = selectNodes(document, query);
  const records = shapeRecords(selection, shape);
  assertMaxRows(records.length);

  return tabularizeRecords(records, columns);
}
