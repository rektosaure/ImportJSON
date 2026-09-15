import { jsonTextToTable } from './core.mjs';

const HTTP_TIMEOUT_SECONDS = 20;
const HTTP_CACHE_TTL_SECONDS = 600;
const HTTP_CACHE_KEY_PREFIX = 'importjson:http:v1:';

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

function normalizeRefresh(value) {
  if (value === undefined) return false;
  const refresh = singleCell(value, 'refresh');

  if (refresh === '' || refresh === false || refresh === 0) return false;
  if (refresh === true || refresh === 1) return true;

  fail('INVALID_ARGUMENT', 'refresh must be TRUE, FALSE, 1, or 0');
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

function digestHex(value) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8,
  );

  return digest
    .map((byte) => (byte & 0xff).toString(16).padStart(2, '0'))
    .join('');
}

function cacheHandle(url) {
  try {
    const cache = CacheService.getScriptCache();
    if (!cache) return undefined;

    return {
      cache,
      key: `${HTTP_CACHE_KEY_PREFIX}${digestHex(`anonymous\0${url}`)}`,
    };
  } catch {
    return undefined;
  }
}

function readCachedBody(handle) {
  if (!handle) return undefined;

  try {
    const body = handle.cache.get(handle.key);
    return body === null ? undefined : body;
  } catch {
    return undefined;
  }
}

function removeCachedBody(handle) {
  if (!handle) return;

  try {
    handle.cache.remove(handle.key);
  } catch {
    // CacheService is best effort; cache failures never fail IMPORTJSON.
  }
}

function headerValue(headers, name) {
  const entry = Object.entries(headers ?? {}).find(
    ([headerName]) => headerName.toLowerCase() === name,
  );
  if (!entry) return undefined;
  return Array.isArray(entry[1]) ? entry[1].join(',') : String(entry[1]);
}

function parseDeltaSeconds(directives, name) {
  for (const directive of directives) {
    const match = new RegExp(`^${name}\\s*=\\s*"?(\\d+)"?$`, 'i').exec(directive);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function cacheTtlSeconds(response) {
  let headers;
  try {
    headers = response.getAllHeaders();
  } catch {
    return HTTP_CACHE_TTL_SECONDS;
  }

  const vary = headerValue(headers, 'vary');
  if (vary?.split(',').some((value) => value.trim() === '*')) return 0;

  const cacheControl = headerValue(headers, 'cache-control');
  if (!cacheControl) return HTTP_CACHE_TTL_SECONDS;

  const directives = cacheControl.split(',').map((directive) => directive.trim());
  if (directives.some((directive) => /^(?:no-store|no-cache|private)(?:\s|=|$)/i.test(directive))) {
    return 0;
  }

  const sharedMaxAge = parseDeltaSeconds(directives, 's-maxage');
  const maxAge = parseDeltaSeconds(directives, 'max-age');
  const originTtl = sharedMaxAge ?? maxAge;

  if (originTtl === undefined) return HTTP_CACHE_TTL_SECONDS;
  return Math.min(originTtl, HTTP_CACHE_TTL_SECONDS);
}

function writeCachedBody(handle, body, ttlSeconds) {
  if (!handle || ttlSeconds <= 0) return;

  try {
    handle.cache.put(handle.key, body, ttlSeconds);
  } catch {
    // CacheService is a best-effort optimization. Oversized values, eviction,
    // quota pressure, or transient cache failures must not affect IMPORTJSON.
  }
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

    return {
      body: response.getContentText(),
      cacheTtlSeconds: cacheTtlSeconds(response),
    };
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

export function runImportJSON(url, query, columns, shape, refresh) {
  const normalizedUrl = normalizeUrl(url);
  const normalizedQuery = optionalSingleCell(query, 'query');
  const normalizedColumns = normalizeColumns(columns);
  const normalizedShape = optionalSingleCell(shape, 'shape');
  const normalizedRefresh = normalizeRefresh(refresh);
  const handle = cacheHandle(normalizedUrl);

  const cachedBody = normalizedRefresh ? undefined : readCachedBody(handle);
  if (cachedBody !== undefined) {
    return renderTable(jsonTextToTable(cachedBody, {
      query: normalizedQuery,
      columns: normalizedColumns,
      shape: normalizedShape,
    }));
  }

  const fetched = fetchBody(normalizedUrl);
  if (fetched.cacheTtlSeconds <= 0) removeCachedBody(handle);

  const table = jsonTextToTable(fetched.body, {
    query: normalizedQuery,
    columns: normalizedColumns,
    shape: normalizedShape,
  });

  writeCachedBody(handle, fetched.body, fetched.cacheTtlSeconds);
  return renderTable(table);
}
