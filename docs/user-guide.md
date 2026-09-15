# ImportJSON User Guide

ImportJSON fetches one JSON document from an HTTP or HTTPS URL and turns selected JSON values into a Google Sheets table.

This guide is the practical reference for the public `IMPORTJSON` function. The [Functional Specification](functional-specification.md) is authoritative when exact observable behavior needs to be resolved.

```text
IMPORTJSON(url, [query], [columns], [shape], [refresh])
```

Examples use commas as formula argument separators. Some Google Sheets locales require semicolons instead.

## Installation

Use artifacts from a GitHub release, not files from a development branch.

### Apps Script Library (recommended)

1. Open the [latest GitHub release](https://github.com/rektosaure/ImportJSON/releases/latest).
2. Open `release-manifest.json` and note `appsScript.scriptId` and `appsScript.version`.
3. In the spreadsheet, open **Extensions → Apps Script**.
4. Add that immutable Library version and set its identifier to `ImportJSONLib`.
5. Copy `ImportJSON.gs` from the same release into the bound Apps Script project.
6. Save the project and return to the spreadsheet.

The wrapper and Library version must come from the same release.

### Manual installation

1. Open the [latest GitHub release](https://github.com/rektosaure/ImportJSON/releases/latest).
2. Copy `importjson-library.gs` into the spreadsheet's bound Apps Script project.
3. Save the project and return to the spreadsheet.

Do not also add `ImportJSON.gs` in manual mode. The complete bundle already exposes `IMPORTJSON`.

The source must be reachable by Apps Script on the first fetch or a forced refresh, and the formula needs enough empty cells for its result to spill.

## Mental model

```text
HTTP URL
    ↓
HTTP cache or GET
    ↓
JSON document
    ↓
query (JSONPath)
    ↓
selected records
    ↓
shape
    ↓
logical rows
    ↓
columns or automatic projection
    ↓
flattening and rendering
    ↓
Google Sheets
```

`query` chooses JSON nodes. `shape` may perform one explicit structural transformation. `columns` may then project values from each logical row. Rendering flattens remaining objects and returns a matrix that Sheets spills into cells.

## Arguments

| Argument | Meaning |
| --- | --- |
| `url` | Absolute HTTP or HTTPS URL returning one JSON document. A literal string or one cell is accepted. |
| `query` | Optional RFC 9535 JSONPath expression. A literal string or one cell is accepted. |
| `columns` | Optional non-empty RFC 6901 JSON Pointer, or a horizontal/vertical range of pointers. |
| `shape` | Optional non-empty JSON Pointer identifying one array to expand, or `"columnar"`. |
| `refresh` | Optional `TRUE`/`1` to bypass HTTP cache lookup for this evaluation. `FALSE`/`0` or blank uses the cache normally. |

For `query`, `columns`, and `shape`, `""` and a blank single cell mean omitted. A blank entry inside a multi-cell `columns` range is invalid.

These are therefore valid:

```gs
=IMPORTJSON(A1)
=IMPORTJSON(A1, "")
=IMPORTJSON(A1, , , "/items")
=IMPORTJSON(A1, , , , B1)
```

## `url`

`url` must be a non-empty absolute `http://` or `https://` URL without whitespace. A multi-cell range is invalid.

ImportJSON may satisfy an invocation from its HTTP cache. Otherwise it performs one GET request, follows redirects, and accepts only a final `2xx` response. Network failures, timeouts, and final non-`2xx` responses produce `HTTP_ERROR`. A successful response whose body is not valid JSON produces `INVALID_JSON`.

ImportJSON currently provides no authentication or credential-management API. Do not treat credentials embedded in a formula or URL as protected secrets.

## HTTP cache, refresh, and sensitive URLs

ImportJSON keeps eligible successful HTTP response bodies in a best-effort Apps Script cache. The requested lifetime is at most 10 minutes; Google may evict entries earlier, and values that CacheService cannot store are simply processed without caching.

### Cache identity

The cache identity is the **exact URL string supplied to ImportJSON after single-cell extraction and validation**. ImportJSON does not canonicalize URLs for caching.

These two URLs therefore use different cache entries even if the server treats them as equivalent:

```text
https://api.example.test/items?a=1&b=2
https://api.example.test/items?b=2&a=1
```

`query`, `columns`, and `shape` do not participate in cache identity. Formulas using the same exact URL can therefore share one downloaded body while applying different transformations:

```gs
=IMPORTJSON(A1, "$.users[*]", "/name")
=IMPORTJSON(A1, "$.users[*]", "/email")
```

### Cache scope

In the recommended Apps Script Library installation, the Script Cache belongs to the Library and can be reused by different spreadsheets using that Library. In manual installation mode, the same code uses the bound Apps Script project's own Script Cache.

This changes cache hit rate and cache scope, not table semantics.

### Server cache directives

ImportJSON does not store responses marked:

- `Cache-Control: no-store`;
- `Cache-Control: no-cache`;
- `Cache-Control: private`;
- `Vary: *`.

For shared-cache freshness, `s-maxage` takes precedence over `max-age`. An effective value of `0` disables storage. A positive value below 600 seconds shortens the requested lifetime; larger values never extend it beyond 600 seconds.

Only a body that successfully completes parsing, selection, shaping, and projection is written to the cache. Cache failures never create a cache-specific public error.

### `refresh`

Accepted values are:

- omitted, blank, `FALSE`, or `0`: normal cache behavior;
- `TRUE` or `1`: bypass cache lookup and perform a fresh GET;
- anything else, including a multi-cell range: `INVALID_ARGUMENT`.

A checkbox is the simplest manual control:

```gs
=IMPORTJSON(A1, , , , B1)
```

Switch `B1` to `TRUE` to force a request. After a successful cache-eligible import, that response replaces the previous entry for the URL. Switch `B1` back to `FALSE` to resume normal cache use.

If `refresh` remains `TRUE`, every later Sheets reevaluation bypasses the cache again. A failed refresh does not replace a previous cached successful body. If a fresh response explicitly forbids shared caching, ImportJSON removes the older entry on a best-effort basis.

Do not use volatile functions such as `NOW()`, `RAND()`, or `RANDBETWEEN()` as refresh arguments.

### Sensitive, signed, or tokenized URLs

The Library cache is shared across scripts that consume the same published Library. Anyone invoking ImportJSON with the same exact URL can potentially receive an eligible cached response without a new request to the origin.

That matters for signed, capability, tokenized, private, or otherwise sensitive URLs: a cached body can remain available until eviction or expiry even if a later origin request would fail. If this is unacceptable, use a source that sends restrictive cache headers such as `private` or `no-store`, or use manual installation so the Script Cache is scoped to the bound Apps Script project.

ImportJSON does not expose raw URLs as CacheService keys; the implementation hashes request identity before storage. This avoids putting URL text directly in cache keys, but it does not make a sensitive URL safe to expose in a spreadsheet.

## `query`: JSONPath selection

`query` follows [JSONPath RFC 9535](https://www.rfc-editor.org/rfc/rfc9535). It determines which nodes become selected records.

Given:

```json
{
  "users": [
    {"id": 1, "name": "Alpha"},
    {"id": 2, "name": "Beta"}
  ]
}
```

use:

```gs
=IMPORTJSON(A1, "$.users[*]")
```

### Omitted query

Omitting `query` is not the same as writing `$`:

- array root: each element becomes a selected record, like `$[*]`;
- any other root: the root becomes one selected record, like `$`.

An explicit `$` on an array root selects the array itself as one record, so automatic projection renders it in the synthetic `@value` column as structured JSON.

JSONPath order and multiplicity are preserved. ImportJSON does not deduplicate selected nodes or apply a final row sort. Where RFC 9535 leaves object-member traversal order open, ImportJSON uses Unicode code-point order for deterministic output.

A query matching nothing is valid. With explicit `columns`, the result contains headers only; without an explicit schema, the result is one blank cell.

## `columns`: JSON Pointer projection

`columns` identifies values relative to each logical row with [JSON Pointer RFC 6901](https://www.rfc-editor.org/rfc/rfc6901). Examples are `/id`, `/name`, and `/details/active`.

ImportJSON reserves the empty string as an omitted Sheets argument, so the RFC 6901 empty pointer that denotes the whole value is not available through `columns` or pointer `shape`. Public pointers are therefore non-empty and begin with `/`.

A property name containing `/` uses `~1`; a property name containing `~` uses `~0`. Property `a/b`, for example, is addressed as `/a~1b`.

A single pointer can be written directly:

```gs
=IMPORTJSON(A1, "$.users[*]", "/name")
```

For several columns, put pointers in a one-dimensional horizontal or vertical range. If `D1:F1` contains `/id`, `/name`, and `/details/active`:

```gs
=IMPORTJSON(A1, "$.users[*]", D1:F1)
```

Explicit projection preserves pointer order exactly. A rectangular two-dimensional range, blank entry, invalid pointer, duplicate pointer, or non-string pointer produces `INVALID_ARGUMENT`.

If a pointer does not resolve for a row, the value is missing. Sheets renders both missing and JSON `null` as an empty cell.

## Automatic projection and structured values

When `columns` is omitted, every logical row follows the same rules:

- object rows are recursively flattened into JSON Pointer headers;
- empty objects contribute no automatic column;
- strings, numbers, booleans, `null`, and arrays contribute the synthetic `@value` column;
- the schema is the union of columns contributed by all logical rows;
- discovered headers, including `@value`, are sorted by Unicode code point.

For example:

```json
[
  {"name": "Alpha"},
  42
]
```

becomes:

```text
/name   @value
Alpha
        42
```

An array or object that reaches a cell without further flattening or shaping is serialized as compact deterministic JSON:

- no formatting whitespace;
- array order preserved;
- object member names sorted recursively by Unicode code point.

For example:

```json
{"z":3,"a":{"y":2,"x":1}}
```

renders as:

```text
{"a":{"x":1,"y":2},"z":3}
```

Strings are not trimmed or converted to dates. Booleans remain booleans. Numbers use JavaScript `Number` semantics after JSON parsing.

## `shape`

`shape` performs at most one explicit structural transformation after selection and before projection.

It has three states:

- omitted: no structural transformation;
- a non-empty JSON Pointer such as `/items`: expand that one array;
- `"columnar"`: convert an object of parallel direct arrays into rows.

There is no automatic table detection, recursive array expansion, or implicit Cartesian product.

### Expand one nested array

Given:

```json
[
  {
    "id": 1,
    "category": "A",
    "items": [
      {"code": "x", "value": 10},
      {"code": "y", "value": 20}
    ]
  }
]
```

use:

```gs
=IMPORTJSON(A1, , , "/items")
```

Result:

```text
/category   /id   /items/code   /items/value
A           1     x             10
A           1     y             20
```

For each selected record:

- non-empty target array: one row per element;
- empty target array: zero rows;
- missing target: one row with the target missing;
- `null` target: one row with the target set to `null`;
- other existing value: `INVALID_EXPANSION_TARGET`.

Properties outside the target subtree are repeated. The current array element replaces the target before normal projection and flattening. Nested arrays are not expanded again.

### `columnar`: object of parallel arrays

Given:

```json
{
  "group": "A",
  "year": [2024, 2025],
  "score": [18, 21]
}
```

use:

```gs
=IMPORTJSON(A1, , , "columnar")
```

Result:

```text
/group   /score   /year
A        18       2024
A        21       2025
```

For each selected record:

- the record must be an object;
- at least one direct property must be an array;
- all direct arrays define one shared row axis and must have identical lengths;
- row `i` uses element `i` from each direct array;
- direct non-array properties repeat on every produced row;
- matching empty arrays produce zero rows.

Different selected objects are columnarized independently and their produced rows are concatenated in selection order. Unequal sibling array lengths produce `COLUMN_LENGTH_MISMATCH`. A non-object record or an object with no direct arrays produces `INVALID_COLUMNAR_TARGET`.

Objects inside aligned arrays are flattened after row construction. Arrays inside aligned arrays remain structured JSON cell values. Arrays nested inside a direct object property do not become another row axis.

## Empty results, rendering, and ordering

The engine distinguishes missing values from JSON `null`, but Sheets renders both as blank cells.

If automatic projection discovers no columns, the result is one blank cell. This includes an empty selection, shaping that produces zero rows, and records consisting only of empty objects.

With explicit `columns`, requested headers remain even when selection or shaping produces no rows.

Row order follows JSONPath selection order, target-array order, and `columnar` array-index order. Explicit column order follows the supplied pointers. Automatic column order is Unicode code-point order.

A spill conflict caused by occupied destination cells is a Sheets error rather than an ImportJSON error.

## Public errors

| Code | Meaning |
| --- | --- |
| `INVALID_ARGUMENT` | Unsupported argument type/shape, invalid or duplicate JSON Pointer, or invalid `refresh` value. |
| `INVALID_URL` | `url` is not an accepted absolute HTTP or HTTPS URL. |
| `HTTP_ERROR` | The GET failed, timed out, or ended with a non-`2xx` status. |
| `INVALID_JSON` | The successful response body is not valid JSON. |
| `INVALID_JSONPATH` | `query` is not valid JSONPath. |
| `INVALID_EXPANSION_TARGET` | Pointer shaping resolves to an existing value that is neither an array nor `null`. |
| `INVALID_COLUMNAR_TARGET` | `columnar` receives a non-object record or an object with no direct arrays. |
| `COLUMN_LENGTH_MISMATCH` | Direct arrays in one columnar record have different lengths. |

A JSONPath selection with no matches is not an error. Public adapter errors do not include remote response bodies or native stack traces.

## Resource and platform limits

The Apps Script adapter sets a 20-second HTTP timeout. A fetch timeout is reported as `HTTP_ERROR`.

Google Apps Script and Google Sheets execution, service, cache, cell, and spill limits also apply. ImportJSON does not define additional public error codes for those platform limits and does not silently truncate successful results.

The cache requests at most 600 seconds of lifetime. CacheService may evict entries earlier or reject values that exceed its limits. Those cache failures are ignored and the import continues normally.

A cache miss or forced refresh performs at most one GET for the invocation, not one fetch per output row or column. A cache hit performs no GET.

## Recipes

Import a root array:

```gs
=IMPORTJSON(A1)
```

Select a nested collection:

```gs
=IMPORTJSON(A1, "$.records[*]")
```

Project columns stored in `D1:F1`:

```gs
=IMPORTJSON(A1, "$.records[*]", D1:F1)
```

Expand one nested array:

```gs
=IMPORTJSON(A1, "$.records[*]", , "/items")
```

Convert an object of parallel arrays:

```gs
=IMPORTJSON(A1, , , "columnar")
```

Use a checkbox in `B1` as a manual refresh control:

```gs
=IMPORTJSON(A1, , , , B1)
```

## Common mistakes

**Using JSONPath in `columns`.** `query` uses JSONPath such as `$.users[*]`; `columns` uses JSON Pointer such as `/name`.

**Expecting arrays to expand automatically.** Arrays remain structured values unless pointer `shape` explicitly targets one array or `columnar` uses direct arrays as the row axis.

**Expecting `columnar` to use nested arrays.** Only direct array properties of the selected object participate.

**Supplying unequal columnar lengths.** ImportJSON does not truncate or pad sibling arrays.

**Treating `$` as omitted query on an array root.** `$` selects the root array itself; omitted `query` selects its elements as records.

**Putting several pointers in one text argument.** Multiple projected columns must come from a one-dimensional cell range.

**Leaving `refresh` set to `TRUE`.** This is valid, but every later reevaluation bypasses the cache. Set the checkbox back to `FALSE` when normal caching is desired.

**Assuming equivalent-looking URLs share cache entries.** Cache identity uses the exact URL string, not a canonicalized URL.
