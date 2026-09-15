# ImportJSON User Guide

ImportJSON fetches one JSON document from an HTTP or HTTPS URL and turns selected JSON values into a Google Sheets table.

This guide is the complete practical reference for the public `IMPORTJSON` function. The [Functional Specification](functional-specification.md) is the normative contract when exact observable behavior needs to be resolved.

```text
IMPORTJSON(url, [query], [columns], [shape], [refreshKey])
```

Examples use commas as formula argument separators. Some Google Sheets locales require semicolons instead.

## Installation and prerequisites

Each ImportJSON release supports two installation modes. Use files from a GitHub release rather than a development branch.

### Apps Script Library (recommended)

This keeps the full implementation in the published Library and adds only a small wrapper to the spreadsheet project.

1. Open the [latest GitHub release](https://github.com/rektosaure/ImportJSON/releases/latest).
2. Open its `release-manifest.json` asset and note `appsScript.scriptId` and `appsScript.version`.
3. In the spreadsheet, open **Extensions → Apps Script**.
4. Add the Library using the Script ID and immutable Apps Script version from the manifest, and set its identifier to `ImportJSONLib`.
5. Download the `ImportJSON.gs` wrapper from the same release and copy it into the bound Apps Script project.
6. Save the project and return to the spreadsheet.

The wrapper and Apps Script Library version must come from the same release.

### Manual installation

This installs the complete implementation directly in the bound Apps Script project and does not use an Apps Script Library.

1. Open the [latest GitHub release](https://github.com/rektosaure/ImportJSON/releases/latest).
2. Download `importjson-library.gs`.
3. In the spreadsheet, open **Extensions → Apps Script**.
4. Create a script file in the bound project and replace its contents with the contents of `importjson-library.gs`.
5. Save the project and return to the spreadsheet.

Do not also add the `ImportJSON.gs` wrapper in manual mode. The complete bundle already exposes the public `IMPORTJSON` custom function.

The source URL must be reachable by an HTTP or HTTPS GET request from Apps Script and must return valid JSON. The formula also needs enough empty cells for its result to spill.

## Mental model

```text
JSON document
    ↓
query
    ↓
selected records
    ↓
shape
    ↓
logical rows
    ↓
columns / automatic projection
    ↓
flattening and rendering
    ↓
Google Sheets
```

`query` selects nodes with JSONPath. `shape` optionally changes row structure once. `columns` optionally projects properties with JSON Pointer. Rendering then flattens nested objects and converts the logical rows into a Sheets matrix.

## Arguments

| Argument | Meaning |
| --- | --- |
| `url` | Absolute HTTP or HTTPS URL returning one JSON document. A literal string or one cell is accepted. |
| `query` | Optional RFC 9535 JSONPath expression. A literal string or one cell is accepted. |
| `columns` | Optional RFC 6901 JSON Pointer, or a horizontal/vertical range containing JSON Pointers. |
| `shape` | Optional JSON Pointer identifying one array to expand, or `"columnar"`. |
| `refreshKey` | Optional recalculation dependency; ignored by the data engine. |

For `query`, `columns`, and `shape`, an empty string is always treated as omitted. This applies to `""` and to a single blank cell, whether or not a later optional argument is present.

For example, all of these use the omitted-query behavior:

```gs
=IMPORTJSON(A1)
=IMPORTJSON(A1, "")
=IMPORTJSON(A1, , , "/items")
```

and this is also valid:

```gs
=IMPORTJSON(A1, , , , B1)
```

A blank entry inside a multi-cell `columns` range is different: it is an invalid column entry rather than an omitted argument.

## `url`

`url` must be a non-empty absolute `http://` or `https://` URL. A multi-cell range is invalid.

ImportJSON performs one GET request, follows redirects, and accepts only a final `2xx` response. A network failure or non-`2xx` response produces `HTTP_ERROR`. A successful response whose body is not valid JSON produces `INVALID_JSON`.

## `query`: JSONPath selection

`query` follows JSONPath RFC 9535 and determines which nodes become selected records. An empty string or blank single cell is treated as omitted.

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

Omitting `query` is not the same as writing `$`.

- If the document root is an array, each root-array element becomes a selected record, like `$[*]`.
- Otherwise the root value becomes one selected record, like `$`.

For a root array, an explicit `$` selects the array itself as one record. With automatic projection it is therefore rendered in the synthetic `@value` column as structured JSON.

JSONPath selection order and multiplicity are preserved. ImportJSON does not deduplicate selected nodes or apply a final row sort. When object-member order is unspecified by JSONPath, member names are traversed in Unicode code-point order for deterministic output.

A query that matches nothing is valid. With explicit columns it returns headers only; without an explicit schema the Sheets result is one blank cell.

## `columns`: JSON Pointer projection

`columns` uses JSON Pointer RFC 6901 relative to each logical row. Examples are `/id`, `/name`, and `/details/active`.

A property name containing `/` uses `~1`; a property name containing `~` uses `~0`. For example, property `a/b` is `/a~1b`.

A single pointer can be written directly:

```gs
=IMPORTJSON(A1, "$.users[*]", "/name")
```

For multiple columns, put pointers in a one-dimensional Sheets range. If `D1:F1` contains `/id`, `/name`, and `/details/active`:

```gs
=IMPORTJSON(A1, "$.users[*]", D1:F1)
```

A direct empty string or a single blank cell means that `columns` is omitted. Once a multi-cell range is used, every entry must contain a non-empty JSON Pointer. Explicit projection preserves the pointer order exactly. A rectangular two-dimensional range, blank entry, invalid pointer, or duplicate pointer produces `INVALID_ARGUMENT`.

If a pointer does not resolve for a row, the value is missing. Google Sheets renders both missing and JSON `null` as an empty cell.

## Automatic projection and flattening

When `columns` is omitted, ImportJSON discovers columns automatically using one rule for every logical row.

Object rows are flattened recursively into JSON Pointer headers. For example:

```json
{"id": 1, "details": {"active": true, "label": "A"}}
```

becomes columns `/details/active`, `/details/label`, and `/id`.

Non-object rows such as strings, numbers, booleans, `null`, or arrays use the synthetic `@value` column. Object and non-object rows may coexist; the automatic schema is the union of all columns contributed by the logical rows. Empty objects contribute no automatic columns. Automatically discovered headers, including `@value`, are sorted by Unicode code point.

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

## Structured values

An array or object that reaches a cell without being flattened or shaped is serialized as compact deterministic JSON:

- no formatting whitespace is added;
- array order is preserved;
- object member names are sorted recursively by Unicode code point.

For example, projecting this object:

```json
{"z":3,"a":{"y":2,"x":1}}
```

renders:

```text
{"a":{"x":1,"y":2},"z":3}
```

An explicitly projected empty object renders as `{}`. Strings are not trimmed or converted to dates. Booleans remain booleans. Numbers use JavaScript `Number` semantics after JSON parsing.

## `shape`

`shape` performs one explicit structural transformation after selection and before projection. An empty string or blank single cell is treated as omitted.

It has three states:

- omitted: no structural transformation;
- a JSON Pointer such as `/items`: expand that one array;
- `"columnar"`: convert an object-of-arrays to row-oriented records.

There is no automatic table detection and no implicit second shaping operation.

## Shaping through a JSON Pointer

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

- a non-empty target array produces one row per element;
- an empty target array produces zero rows;
- a missing target produces one row with that target missing;
- a `null` target produces one row with that target set to `null`;
- another existing value produces `INVALID_EXPANSION_TARGET`.

Properties outside the target subtree are repeated on every produced row. The current array element replaces the target before normal projection and flattening.

Nested arrays are not recursively expanded. ImportJSON does not create a Cartesian product. Explicit `columns` are resolved after shaping, so pointers such as `/items/code` refer to the shaped row.

If pointer shaping produces zero rows, automatic projection has no schema and the Sheets result is one blank cell. Supply explicit `columns` when headers should remain present even when there are no data rows.

## `columnar`: object-of-arrays to records

`columnar` is a generic transformation for JSON objects whose direct array properties represent parallel columns.

Source:

```json
{
  "group": "A",
  "year": [2024, 2025],
  "score": [18, 21]
}
```

Formula:

```gs
=IMPORTJSON(A1, , , "columnar")
```

With automatic projection, the output is:

```text
/group   /score   /year
A        18       2024
A        21       2025
```

The mode is always explicit. For each selected record:

- the selected value must be an object;
- it must contain at least one direct array property;
- every direct array property defines the row axis;
- all direct arrays within that object must have identical lengths;
- array elements are aligned strictly by index;
- every direct non-array property is repeated for every produced row;
- empty parallel arrays produce zero rows.

There is no truncation, padding, Cartesian product, or recursive second shaping operation.

Direct non-array properties may themselves be objects; they are repeated and then flattened normally. Elements inside the parallel arrays may also be objects; each aligned object element is flattened after row construction. If an aligned array element is itself an array, that nested array remains a structured JSON cell value.

Only direct arrays of the selected object participate. Arrays nested inside a direct object property do not become additional row axes.

When `query` selects multiple objects, each is columnarized independently and the resulting rows are concatenated in selection order. Different selected objects may produce different row counts; equal length is required only among sibling direct arrays within the same object.

If direct arrays have different lengths, ImportJSON produces `COLUMN_LENGTH_MISMATCH`. A non-object selected record or an object with no direct array produces `INVALID_COLUMNAR_TARGET`.

If `columnar` produces zero rows, automatic projection has no schema and the Sheets result is one blank cell. Supply explicit `columns` when headers should remain present without data rows.

## `refreshKey`

`refreshKey` affects formula dependency tracking but is ignored by the data engine.

A practical pattern is a manually edited cell:

```gs
=IMPORTJSON(A1, , , , B1)
```

Changing `B1` can cause Sheets to reevaluate the formula without changing the import semantics. Do not use volatile functions such as `NOW()`, `RAND()`, or `RANDBETWEEN()` for this purpose.

ImportJSON has no private HTTP cache and does not promise that remote changes are observed until Sheets reevaluates the formula.

## `null`, missing values, and empty results

The engine distinguishes JSON `null` from a missing property, but the Sheets renderer displays both as an empty cell.

If automatic projection discovers no columns, the rendered result is one blank cell. This includes an empty selection, shaping that produces zero logical rows, and records made only of empty objects.

With explicit `columns`, the requested headers remain even when selection or shaping produces no rows.

## Ordering

Rows preserve JSONPath selection order. Pointer shaping preserves target-array order. `columnar` preserves array index order. Multiple shaped records remain grouped in selection order.

Column order is different:

- explicit projection uses the supplied pointer order;
- automatic projection sorts all discovered headers by Unicode code point;
- non-object rows contribute `@value`, which may coexist with JSON Pointer headers.

## Public errors

| Code | Meaning |
| --- | --- |
| `INVALID_ARGUMENT` | An argument has an unsupported type or shape, or contains an invalid/duplicate JSON Pointer. |
| `INVALID_URL` | `url` is not an absolute HTTP or HTTPS URL. |
| `HTTP_ERROR` | The request failed or the final status was not `2xx`. |
| `INVALID_JSON` | The successful response body is not valid JSON. |
| `INVALID_JSONPATH` | `query` is not valid JSONPath. |
| `INVALID_EXPANSION_TARGET` | Pointer shaping resolves to an existing value that is neither an array nor `null`. |
| `INVALID_COLUMNAR_TARGET` | `columnar` receives a non-object record or an object with no direct arrays. |
| `COLUMN_LENGTH_MISMATCH` | Direct arrays in one columnar record have different lengths. |

A JSONPath selection with no matches is not an error.

## Resource and platform limits

The Apps Script adapter sets a 20-second HTTP timeout. A fetch timeout is reported as `HTTP_ERROR`.

The function also runs within Google Apps Script and Google Sheets limits, including execution, service, cell, and spill constraints. The current implementation does not define additional ImportJSON error codes for those platform limits. A spill conflict caused by occupied destination cells is a Sheets error.

ImportJSON performs one fetch per invocation, not one fetch per output row or column.

## Practical recipes

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

Convert an object-of-arrays:

```gs
=IMPORTJSON(A1, , , "columnar")
```

Add a manual refresh dependency:

```gs
=IMPORTJSON(A1, , , , B1)
```

## Common mistakes

**Using JSONPath in `columns`.** `query` uses JSONPath such as `$.users[*]`; `columns` uses JSON Pointer such as `/name`.

**Expecting arrays to expand automatically.** Arrays remain structured values unless a pointer `shape` targets one array or `columnar` explicitly uses direct arrays as the row axis.

**Expecting `columnar` to use nested arrays.** Only direct array properties of the selected object participate.

**Supplying unequal columnar lengths.** ImportJSON does not truncate or pad sibling arrays.

**Treating `$` as omitted query on a root array.** `$` selects the root array itself; omitted `query` selects its elements as records.

**Putting several pointers in one text argument.** Multiple projected columns must come from a one-dimensional cell range.

## Complete examples

### Selection, projection, and flattening

Source:

```json
{
  "users": [
    {"id": 1, "name": "Alpha", "details": {"active": true}},
    {"id": 2, "name": "Beta", "details": {"active": false}}
  ]
}
```

Put `/id`, `/name`, and `/details/active` in `D1:F1` and use:

```gs
=IMPORTJSON(A1, "$.users[*]", D1:F1)
```

Output:

```text
/id   /name   /details/active
1     Alpha   TRUE
2     Beta    FALSE
```

### Nested-array shaping

Source:

```json
[
  {"id":"r1","items":[{"code":"A","quantity":2},{"code":"B","quantity":3}]},
  {"id":"r2","items":[{"code":"C","quantity":1}]}
]
```

Formula:

```gs
=IMPORTJSON(A1, , , "/items")
```

Output:

```text
/id   /items/code   /items/quantity
r1    A             2
r1    B             3
r2    C             1
```

### Columnar shaping with object elements

Source:

```json
{
  "category": "sample",
  "year": [2024, 2025],
  "measurement": [
    {"score": 18, "valid": true},
    {"score": 21, "valid": false}
  ]
}
```

Formula:

```gs
=IMPORTJSON(A1, , , "columnar")
```

Output:

```text
/category   /measurement/score   /measurement/valid   /year
sample      18                   TRUE                 2024
sample      21                   FALSE                2025
```

The transformation is defined only by the JSON structure: direct arrays become aligned rows and direct non-array properties are repeated.
