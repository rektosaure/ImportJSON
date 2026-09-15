# ImportJSON User Guide

ImportJSON fetches one JSON document from an HTTP or HTTPS URL and turns selected JSON values into a Google Sheets table.

This guide explains how to use the public `IMPORTJSON` function. The [Functional Specification](functional-specification.md) is authoritative for exact observable behavior.

```text
IMPORTJSON(url, [query], [columns], [shape], [refresh])
```

Examples use commas as formula separators. Some Google Sheets locales require semicolons instead.

## Installation

Use one of the two release installation modes described in the [README](../README.md#installation):

- **Apps Script Library (recommended):** published Library plus the matching `ImportJSON.gs` wrapper;
- **manual installation:** the complete `importjson-library.gs` bundle in the spreadsheet's bound Apps Script project.

Always use artifacts from the same GitHub release. Do not combine the Library wrapper with the manual bundle.

The source must be reachable by Apps Script when a network request is needed, and the formula needs enough empty cells for its result to spill.

## How an import is processed

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

`query` chooses JSON nodes. `shape` may perform one structural transformation. `columns` may then project values from each logical row. Rendering flattens remaining objects and returns the matrix that Sheets displays.

## Arguments

| Argument | Meaning |
| --- | --- |
| `url` | Absolute HTTP or HTTPS URL returning one JSON document. A literal string or one cell is accepted. |
| `query` | Optional RFC 9535 JSONPath expression. A literal string or one cell is accepted. |
| `columns` | Optional non-empty RFC 6901 JSON Pointer, or a horizontal/vertical range of pointers. |
| `shape` | Optional non-empty JSON Pointer identifying one array to expand, or `"columnar"`. |
| `refresh` | Optional `TRUE`/`1` to bypass HTTP cache lookup for this evaluation. `FALSE`/`0` or blank uses the cache normally. |

For `query`, `columns`, and `shape`, `""` and a blank single cell mean omitted. A blank entry inside a multi-cell `columns` range is invalid.

For example:

```gs
=IMPORTJSON(A1)
=IMPORTJSON(A1, "$.users[*]")
=IMPORTJSON(A1, "$.users[*]", D1:F1)
=IMPORTJSON(A1, , , "/items")
=IMPORTJSON(A1, , , "columnar")
=IMPORTJSON(A1, , , , B1)
```

## `url`

`url` must be a non-empty absolute `http://` or `https://` URL without whitespace. A multi-cell range is invalid.

ImportJSON may satisfy the invocation from its HTTP cache. Otherwise it performs one GET request, follows redirects, and accepts only a final `2xx` response. Network failures, timeouts, and final non-`2xx` responses produce `HTTP_ERROR`. A successful response whose body is not valid JSON produces `INVALID_JSON`.

ImportJSON currently provides no authentication or credential-management API. Do not treat credentials embedded in a formula or URL as protected secrets.

## HTTP cache and `refresh`

ImportJSON keeps eligible successful response bodies in a best-effort Apps Script cache for at most 10 minutes. Google may evict entries earlier, and a response that cannot be stored is still processed normally.

The cache identity is the **exact URL string** supplied to ImportJSON after single-cell extraction and validation. It is not canonicalized. These URLs therefore use different entries:

```text
https://api.example.test/items?a=1&b=2
https://api.example.test/items?b=2&a=1
```

`query`, `columns`, `shape`, and `refresh` do not change cache identity. Formulas using the same exact URL can reuse one downloaded body while applying different transformations.

In Library mode, the Script Cache belongs to the Library and can be reused by different spreadsheets using that Library. In manual mode, the cache belongs to the bound Apps Script project.

ImportJSON respects HTTP response directives that forbid shared caching or shorten freshness. The exact rules are defined in the [Functional Specification](functional-specification.md#3-url-http-acquisition-and-cache).

### Manual refresh

A checkbox in `B1` is the simplest manual control:

```gs
=IMPORTJSON(A1, , , , B1)
```

- blank, `FALSE`, or `0`: normal cache behavior;
- `TRUE` or `1`: bypass cache lookup and perform a fresh GET;
- any other value: `INVALID_ARGUMENT`.

A successful cache-eligible refresh replaces the existing entry for that URL. A failed refresh does not replace a previous cached success. If `refresh` remains `TRUE`, every later Sheets reevaluation bypasses the cache again.

Do not use volatile functions such as `NOW()`, `RAND()`, or `RANDBETWEEN()` as refresh arguments.

### Sensitive URLs

Because the Library cache is shared between scripts consuming the same Library, an eligible cached body for one exact URL can be reused by another spreadsheet using that same exact URL without contacting the origin again.

For signed, capability, tokenized, private, or otherwise sensitive URLs, prefer an origin that sends restrictive cache headers such as `private` or `no-store`, or use manual installation if project-local cache scope is required.

ImportJSON hashes request identity before using it as a CacheService key, but this does not make a sensitive URL safe to expose in a spreadsheet.

## `query`: JSONPath selection

`query` follows [JSONPath RFC 9535](https://www.rfc-editor.org/rfc/rfc9535).

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

Omitting `query` is not the same as writing `$`:

- with an array root, omitted `query` selects each array element as a record, like `$[*]`;
- with any other root, omitted `query` selects the root as one record, like `$`.

An explicit `$` on an array root selects the array itself as one record, so automatic projection renders it in the synthetic `@value` column as structured JSON.

JSONPath order and multiplicity are preserved. ImportJSON does not deduplicate selected nodes or apply a final row sort. A query matching nothing is valid.

## `columns`: JSON Pointer projection

`columns` identifies values relative to each logical row with [JSON Pointer RFC 6901](https://www.rfc-editor.org/rfc/rfc6901). Examples are `/id`, `/name`, and `/details/active`.

ImportJSON reserves the empty string as an omitted Sheets argument, so the RFC 6901 empty pointer that denotes the whole value is not available through public `columns` or pointer `shape` arguments. Public pointers are non-empty and begin with `/`.

A property name containing `/` uses `~1`; a property name containing `~` uses `~0`. Property `a/b`, for example, is addressed as `/a~1b`.

A single pointer can be supplied directly:

```gs
=IMPORTJSON(A1, "$.users[*]", "/name")
```

For several columns, put pointers in a one-dimensional horizontal or vertical range. If `D1:F1` contains `/id`, `/name`, and `/details/active`:

```gs
=IMPORTJSON(A1, "$.users[*]", D1:F1)
```

Explicit projection preserves pointer order. A rectangular two-dimensional range, blank entry, invalid pointer, duplicate pointer, or non-string pointer produces `INVALID_ARGUMENT`.

A missing property and JSON `null` both render as an empty cell.

## Automatic projection and structured values

When `columns` is omitted:

- object rows are recursively flattened into JSON Pointer headers;
- empty objects contribute no automatic column;
- strings, numbers, booleans, `null`, and arrays use the synthetic `@value` column;
- the schema is the union of columns contributed by all logical rows;
- discovered headers are sorted by Unicode code point.

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

An array or object that reaches a cell is serialized as compact deterministic JSON: array order is preserved and object member names are sorted recursively by Unicode code point.

Strings are not trimmed or converted to dates. Booleans remain booleans. Numbers use JavaScript `Number` semantics after JSON parsing.

## `shape`

`shape` performs at most one explicit structural transformation after selection and before projection. It is either a non-empty JSON Pointer identifying one array or the literal `"columnar"`.

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

For each selected record, a non-empty target array produces one row per element, an empty target array produces zero rows, and missing or `null` targets remain one row. Any other existing target produces `INVALID_EXPANSION_TARGET`.

Properties outside the target subtree are repeated. Nested arrays are not expanded again.

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

For each selected record, direct array properties define one shared row axis and must have equal lengths. Direct non-array properties repeat on every produced row. Matching empty arrays produce zero rows.

Different selected objects are processed independently and concatenated in selection order. Unequal sibling array lengths produce `COLUMN_LENGTH_MISMATCH`. A non-object record or an object with no direct arrays produces `INVALID_COLUMNAR_TARGET`.

Objects inside aligned arrays are flattened after row construction. Arrays inside aligned arrays remain structured JSON cell values. Nested arrays inside object properties do not become another row axis.

## Empty results, ordering, and spill behavior

If automatic projection discovers no columns, the result is one blank cell. With explicit `columns`, requested headers remain even when selection or shaping produces no rows.

Row order follows JSONPath selection order, target-array order, and `columnar` array-index order. Explicit columns preserve supplied order; automatic columns use Unicode code-point order.

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

## Platform limits

The Apps Script adapter sets a 20-second HTTP timeout. Google Apps Script and Google Sheets execution, service, cache, cell, and spill limits also apply.

ImportJSON does not silently truncate successful results or define extra public error codes for platform limits. Cache failures are treated as cache misses or ignored writes.

## Common mistakes

**Using JSONPath in `columns`.** `query` uses JSONPath such as `$.users[*]`; `columns` uses JSON Pointer such as `/name`.

**Expecting arrays to expand automatically.** Arrays remain structured values unless `shape` explicitly expands one array or `columnar` uses direct arrays as the row axis.

**Treating `$` as omitted query on an array root.** `$` selects the root array itself; omitted `query` selects its elements as records.

**Leaving `refresh` set to `TRUE`.** Every later reevaluation bypasses the cache until the value returns to `FALSE` or `0`.
