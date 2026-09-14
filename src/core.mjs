import { JSONPathEnvironment } from 'json-p3';

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

function flattenObject(value, pointer, output) {
  for (const key of Object.keys(value)) {
    const child = value[key];
    const childPointer = `${pointer}/${escapePointerToken(key)}`;

    if (isObject(child)) flattenObject(child, childPointer, output);
    else output.set(childPointer, cellValue(child));
  }
}

function discoverOutsideHeaders(value, pointer, shapePointer, headers) {
  for (const key of Object.keys(value)) {
    const child = value[key];
    const childPointer = `${pointer}/${escapePointerToken(key)}`;

    if (childPointer === shapePointer) continue;

    if (shapePointer.startsWith(`${childPointer}/`)) {
      if (isObject(child)) {
        discoverOutsideHeaders(child, childPointer, shapePointer, headers);
      }
      continue;
    }

    if (isObject(child)) {
      const values = new Map();
      flattenObject(child, childPointer, values);
      for (const header of values.keys()) headers.add(header);
    } else {
      headers.add(childPointer);
    }
  }
}

function discoverColumnarOutsideHeaders(record, headers) {
  for (const key of Object.keys(record)) {
    const child = record[key];
    if (Array.isArray(child)) continue;

    const childPointer = `/${escapePointerToken(key)}`;
    if (isObject(child)) {
      const values = new Map();
      flattenObject(child, childPointer, values);
      for (const header of values.keys()) headers.add(header);
    } else {
      headers.add(childPointer);
    }
  }
}

function selectRecords(document, query) {
  if (query === undefined) {
    return Array.isArray(document) ? document : [document];
  }

  if (typeof query !== 'string' || query.length === 0) {
    fail('INVALID_ARGUMENT', 'query must be a non-empty JSONPath string');
  }

  const environment = new JSONPathEnvironment();
  environment.entries = (object) => Object.entries(object)
    .sort(([left], [right]) => compareUnicodeCodePoints(left, right));

  try {
    return Array.from(environment.query(query, document), (node) => node.value);
  } catch {
    fail('INVALID_JSONPATH', 'query is not a valid JSONPath expression');
  }
}

function expandRecords(records, shape) {
  const tokens = parsePointer(shape, 'shape');
  const outsideHeaders = new Set();
  const shapedRecords = [];

  for (const record of records) {
    if (isObject(record)) {
      discoverOutsideHeaders(record, '', shape, outsideHeaders);
    }

    const target = resolvePointer(record, tokens);

    if (target === undefined || target === null) {
      shapedRecords.push(record);
      continue;
    }

    if (!Array.isArray(target)) {
      fail('INVALID_EXPANSION_TARGET', 'shape JSON Pointer must resolve to an array, null, or a missing value');
    }

    for (const element of target) {
      shapedRecords.push(replacePointer(record, tokens, element));
    }
  }

  return {
    records: shapedRecords,
    shaped: true,
    outsideHeaders: [...outsideHeaders],
  };
}

function columnarizeRecords(records) {
  const outsideHeaders = new Set();
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

    discoverColumnarOutsideHeaders(record, outsideHeaders);

    for (let index = 0; index < rowCount; index++) {
      const shapedRecord = {};
      for (const [key, value] of entries) {
        shapedRecord[key] = Array.isArray(value) ? value[index] : value;
      }
      shapedRecords.push(shapedRecord);
    }
  }

  return {
    records: shapedRecords,
    shaped: true,
    outsideHeaders: [...outsideHeaders],
  };
}

function shapeRecords(records, shape) {
  if (shape === undefined) {
    return { records, shaped: false, outsideHeaders: [] };
  }

  if (shape === 'columnar') {
    return columnarizeRecords(records);
  }

  return expandRecords(records, shape);
}

function tabularizeRecords(records, columns, { shaped = false, outsideHeaders = [] } = {}) {
  if (columns !== undefined) {
    if (!Array.isArray(columns) || columns.length === 0) {
      fail('INVALID_ARGUMENT', 'columns must be a non-empty list of JSON Pointers');
    }

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

  if (!shaped) {
    const hasObject = records.some(isObject);
    const hasNonObject = records.some((record) => !isObject(record));

    if (hasObject && hasNonObject) {
      fail('HETEROGENEOUS_RECORDS', 'automatic projection cannot mix object and non-object records');
    }

    if (records.length > 0 && !hasObject) {
      return {
        headers: ['@value'],
        rows: records.map((record) => [cellValue(record)]),
      };
    }
  }

  const flattened = records.map((record) => {
    const values = new Map();

    if (isObject(record)) flattenObject(record, '', values);
    else values.set('@value', cellValue(record));

    return values;
  });

  const headers = [...new Set([
    ...outsideHeaders,
    ...flattened.flatMap((values) => [...values.keys()]),
  ])].sort(compareUnicodeCodePoints);

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

  const selection = selectRecords(document, query);
  const shaping = shapeRecords(selection, shape);

  return tabularizeRecords(shaping.records, columns, shaping);
}
