import { jsonTextToTable } from './core.mjs';

const HTTP_TIMEOUT_SECONDS = 20;

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function singleCell(value, name) {
  if (!Array.isArray(value)) return value;

  if (
    value.length === 1
    && Array.isArray(value[0])
    && value[0].length === 1
  ) {
    return value[0][0];
  }

  fail('INVALID_ARGUMENT', `${name} must be a single cell or literal value`);
}

function optionalSingleCell(value, name) {
  if (value === undefined) return undefined;
  const normalized = singleCell(value, name);
  return normalized === '' ? undefined : normalized;
}

function normalizeUrl(value) {
  const url = singleCell(value, 'url');

  if (typeof url !== 'string' || url.length === 0 || /\s/.test(url)) {
    fail('INVALID_URL', 'url must be an absolute HTTP or HTTPS URL');
  }

  const match = /^https?:\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(url);
  if (!match) {
    fail('INVALID_URL', 'url must be an absolute HTTP or HTTPS URL');
  }

  const authority = match[1];
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1);

  if (!hostPort || hostPort === ':' || hostPort.startsWith(':')) {
    fail('INVALID_URL', 'url must be an absolute HTTP or HTTPS URL');
  }

  return url;
}

function normalizeColumns(value) {
  if (value === undefined || value === '') return undefined;
  if (typeof value === 'string') return [value];

  if (!Array.isArray(value) || value.length === 0 || !value.every(Array.isArray)) {
    fail('INVALID_ARGUMENT', 'columns must be one JSON Pointer or a one-dimensional range');
  }

  const width = value[0].length;
  if (width === 0 || value.some((row) => row.length !== width)) {
    fail('INVALID_ARGUMENT', 'columns must be one JSON Pointer or a one-dimensional range');
  }

  let columns;
  if (value.length === 1) columns = value[0];
  else if (width === 1) columns = value.map((row) => row[0]);
  else fail('INVALID_ARGUMENT', 'columns range must be horizontal or vertical');

  if (columns.length === 1 && columns[0] === '') return undefined;

  if (columns.some((column) => typeof column !== 'string' || column.length === 0)) {
    fail('INVALID_ARGUMENT', 'columns must contain non-empty JSON Pointers');
  }

  return columns;
}

function fetchBody(url) {
  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      followRedirects: true,
      muteHttpExceptions: true,
      timeoutSeconds: HTTP_TIMEOUT_SECONDS,
    });

    const status = response.getResponseCode();
    if (status < 200 || status > 299) {
      fail('HTTP_ERROR', `HTTP request failed with status ${status}`);
    }

    return response.getContentText();
  } catch (error) {
    if (error?.code === 'HTTP_ERROR') throw error;
    fail('HTTP_ERROR', 'HTTP request failed');
  }
}

function renderTable(table) {
  if (table.headers.length === 0) return [['']];

  return [
    table.headers,
    ...table.rows.map((row) => row.map((value) => (
      value === undefined || value === null ? '' : value
    ))),
  ];
}

export function runImportJSON(url, query, columns, shape, refreshKey) {
  const normalizedUrl = normalizeUrl(url);
  const normalizedQuery = optionalSingleCell(query, 'query');
  const normalizedColumns = normalizeColumns(columns);
  const normalizedShape = optionalSingleCell(shape, 'shape');

  return renderTable(jsonTextToTable(fetchBody(normalizedUrl), {
    query: normalizedQuery,
    columns: normalizedColumns,
    shape: normalizedShape,
  }));
}
