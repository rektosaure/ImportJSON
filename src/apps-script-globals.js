/**
 * Imports JSON from an HTTP(S) URL into a Google Sheets table.
 *
 * @param {string} url HTTP or HTTPS URL returning one JSON document.
 * @param {string=} query Optional RFC 9535 JSONPath expression.
 * @param {string|Array<Array<string>>=} columns Optional JSON Pointer column or one-dimensional range.
 * @param {string=} shape Optional `columnar`/`preserve` mode or JSON Pointer to one array to expand.
 * @param {string=} cache Optional cache mode: `default`, `refresh`, or `off`.
 * @param {string=} authorization Optional HTTP Authorization header value. Authenticated requests require HTTPS.
 * @return {Array<Array<*>>} A two-dimensional matrix for Google Sheets.
 * @customfunction
 */
function IMPORTJSON(url, query, columns, shape, cache, authorization) {
  return ImportJSONBundle.runImportJSON(url, query, columns, shape, cache, authorization);
}
