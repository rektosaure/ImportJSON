/**
 * Imports JSON from an HTTP(S) URL into a Google Sheets table.
 *
 * @param {string} url HTTP or HTTPS URL returning one JSON document.
 * @param {string=} query Optional RFC 9535 JSONPath expression.
 * @param {string|Array<Array<string>>=} columns Optional JSON Pointer column or one-dimensional range.
 * @param {string=} shape Optional `columnar` mode or JSON Pointer to one array to expand.
 * @param {boolean|number=} refresh Optional TRUE/1 to bypass the HTTP cache for this evaluation.
 * @return {Array<Array<*>>} A two-dimensional matrix for Google Sheets.
 * @customfunction
 */
function IMPORTJSON(url, query, columns, shape, refresh) {
  return ImportJSONBundle.runImportJSON(url, query, columns, shape, refresh);
}
