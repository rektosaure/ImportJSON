/**
 * Imports JSON from an HTTP(S) URL into a Google Sheets table.
 *
 * Requires the ImportJSON Apps Script Library to be added to this project
 * with the identifier `ImportJSONLib`.
 *
 * @param {string} url HTTP or HTTPS URL returning one JSON document.
 * @param {string=} query Optional RFC 9535 JSONPath expression.
 * @param {string|Array<Array<string>>=} columns Optional JSON Pointer column or one-dimensional range.
 * @param {string=} shape Optional `columnar` mode or JSON Pointer to one array to expand.
 * @param {*=} refreshKey Optional recalculation dependency; ignored by the data engine.
 * @return {Array<Array<*>>} A two-dimensional matrix for Google Sheets.
 * @customfunction
 */
function IMPORTJSON(url, query, columns, shape, refreshKey) {
  return ImportJSONLib.IMPORTJSON(url, query, columns, shape, refreshKey);
}
