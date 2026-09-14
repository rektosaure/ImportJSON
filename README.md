# ImportJSON

ImportJSON is a general-purpose Google Sheets custom function that fetches one JSON document from an HTTP or HTTPS URL and turns selected JSON values into a table.

It uses standard JSON tools for each step:

- JSONPath (RFC 9535) selects nodes from the document;
- JSON Pointer (RFC 6901) identifies projected columns;
- `shape` performs one explicit structural transformation when selected data needs to become rows;
- nested objects are flattened into JSON Pointer columns;
- structured values that are not expanded are rendered as deterministic compact JSON.

## Install

ImportJSON v1 is distributed as an Apps Script Library plus a small wrapper.

1. Open the Google Sheet, then choose **Extensions → Apps Script**.
2. Add the published ImportJSON Library version using the Script ID supplied with the release, and use `ImportJSONLib` as the library identifier.
3. Copy [`dist/ImportJSON.gs`](dist/ImportJSON.gs) into the Apps Script project.
4. Save the project and return to the sheet.

The wrapper exposes the `IMPORTJSON` custom function in the spreadsheet. Pin a published Library version rather than a development version.

## Syntax

```text
IMPORTJSON(url, [query], [columns], [shape], [refreshKey])
```

The examples below use commas as formula argument separators. Some Google Sheets locales use semicolons instead.

| Argument | Purpose |
| --- | --- |
| `url` | Absolute HTTP or HTTPS URL that returns one JSON document. |
| `query` | Optional JSONPath expression selecting records. |
| `columns` | Optional JSON Pointer, or a one-dimensional cell range containing JSON Pointers. |
| `shape` | Optional JSON Pointer that expands one nested array, or `"columnar"` for an object-of-arrays. |
| `refreshKey` | Optional recalculation dependency; it does not change the imported data. |

## Quick start

Suppose `A1` contains the URL of a document with this JSON:

```json
[
  {"id": 1, "name": "Alpha", "details": {"active": true}},
  {"id": 2, "name": "Beta", "details": {"active": false}}
]
```

Use:

```gs
=IMPORTJSON(A1)
```

The result is:

```text
/details/active   /id   /name
TRUE              1     Alpha
FALSE             2     Beta
```

When `query` is omitted, a root array contributes one selected record per element. A non-array root is treated as one selected record.

## Select with JSONPath

Use an RFC 9535 JSONPath expression to select nodes before tabularization:

```gs
=IMPORTJSON(A1, "$.users[*]")
```

JSONPath controls **which nodes are selected**. ImportJSON preserves the selection order and multiplicity produced by the JSONPath engine.

## Choose columns with JSON Pointer

A single JSON Pointer can be supplied directly:

```gs
=IMPORTJSON(A1, "$.users[*]", "/name")
```

For multiple columns, place JSON Pointers in a horizontal or vertical range, for example `/id`, `/name`, and `/details/active` in `D1:F1`:

```gs
=IMPORTJSON(A1, "$.users[*]", D1:F1)
```

Explicit projection preserves the order of the pointers in the range. Without `columns`, ImportJSON discovers columns automatically by flattening nested objects.

## Expand one nested array

If each selected record contains an array that should become rows, pass its JSON Pointer as `shape`:

```json
[
  {"id": 1, "items": [{"code": "A"}, {"code": "B"}]}
]
```

```gs
=IMPORTJSON(A1, , , "/items")
```

Result:

```text
/id   /items/code
1     A
1     B
```

Only that array is expanded. ImportJSON does not recursively expand nested arrays or create an implicit Cartesian product.

## Convert an object-of-arrays with `columnar`

Some JSON represents table columns as parallel arrays:

```json
{
  "group": "A",
  "year": [2024, 2025],
  "score": [18, 21]
}
```

Use:

```gs
=IMPORTJSON(A1, , , "columnar")
```

Result:

```text
/group   /score   /year
A        18       2024
A        21       2025
```

`columnar` is explicit: ImportJSON never guesses that an object is tabular. All direct array properties define the row axis and must have the same length. Direct non-array properties are repeated for each row.

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

Each stage is independent: JSONPath selects, `shape` changes row structure once, JSON Pointer projects columns, and rendering converts the resulting logical rows into the spilled Sheets matrix.

## Documentation

See the [User Guide](docs/user-guide.md) for the complete practical reference, including omitted-query behavior, projection rules, structured values, shaping semantics, `null` and missing properties, ordering, errors, limits, recipes, and end-to-end examples.

Maintainer references:

- [Functional Specification](docs/functional-specification.md) — normative public behavior
- [Architecture](docs/architecture.md) — technical boundaries and invariants
- [Validation](docs/validation.md) — release acceptance criteria
- [Releasing](docs/releasing.md) — automated GitHub and Apps Script publication
- [JSONPath Qualification](docs/jsonpath-qualification.md) — RFC 9535 engine qualification

## License

ImportJSON is licensed under the MIT License. See [LICENSE](LICENSE).
