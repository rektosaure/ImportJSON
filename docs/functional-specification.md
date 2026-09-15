# ImportJSON — Functional Specification

**Target:** Google Sheets / Google Apps Script  
**Public API:** v1

This document defines the observable behavior of ImportJSON. If it conflicts with [`architecture.md`](architecture.md), this specification is authoritative.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as described in BCP 14 (RFC 2119 / RFC 8174).

## 1. Principles

ImportJSON fetches one JSON document from an HTTP or HTTPS URL and transforms a selection from that document into a deterministic Google Sheets table.

For the same JSON response, `query`, `columns`, `shape`, and implementation version, the produced rows, columns, headers, and structured-value serialization MUST be deterministic.

ImportJSON MUST NOT implicitly:

- concatenate array elements;
- trim JSON strings;
- convert strings to dates;
- truncate structured values;
- create a Cartesian product;
- detect an object-of-arrays table;
- change the meaning of an explicit JSONPath expression.

The public model uses JSON (RFC 8259), JSONPath (RFC 9535), and JSON Pointer (RFC 6901). It defines no proprietary query language.

After HTTP acquisition, JSON values follow JavaScript runtime semantics. Numeric source lexemes are not preserved and numbers use JavaScript `Number` semantics.

## 2. Public function

The only public Google Sheets function is:

```text
IMPORTJSON(url, [query], [columns], [shape], [refreshKey])
```

The processing order is:

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

At most one shaping operation is applied per invocation.

## 3. `url` and HTTP acquisition

`url` MUST resolve to a non-empty absolute `http:` or `https:` URL. It MAY be supplied as a literal value or a single-cell reference.

A multi-cell range used as `url` produces `INVALID_ARGUMENT`. An invalid URL or unsupported scheme produces `INVALID_URL`.

The adapter MUST perform one GET request for the invocation, follow redirects, and accept only a final `2xx` response as success. A network failure, timeout, or final non-`2xx` response produces `HTTP_ERROR`.

The adapter uses a 20-second HTTP timeout.

The successful response body MUST parse as JSON. Otherwise the invocation produces `INVALID_JSON`.

ImportJSON does not accept raw JSON text in place of `url` through the public Sheets function.

## 4. `query` and JSONPath selection

When supplied, `query` MUST resolve to a non-empty string containing an RFC 9535 JSONPath expression. A non-string value, blank string, or multi-cell range produces `INVALID_ARGUMENT`. Invalid JSONPath syntax produces `INVALID_JSONPATH`.

An empty JSONPath selection is valid and MUST NOT produce a no-match error.

### 4.1 Omitted query

Omitted `query` has dedicated behavior:

- if the document root is an array, each array element becomes one selected record;
- otherwise the root value becomes one selected record.

Therefore omitted `query` on an array root is equivalent to `$[*]`, not `$`.

### 4.2 Order and multiplicity

Order required by RFC 9535 MUST be preserved. Selected nodes MUST NOT be deduplicated.

When object-member traversal order is not defined by JSONPath, ImportJSON MUST use member-name order by Unicode code point. ImportJSON MUST NOT apply a global row sort after selection.

## 5. Records and JSON Pointer columns

Every selected node initially becomes one selected record. Shaping MAY transform one selected record into zero, one, or multiple logical rows.

Properties are identified relative to each logical row by RFC 6901 JSON Pointer, for example `/id`, `/details/name`, or `/metrics/value`. Standard `~0` and `~1` escaping applies.

## 6. Automatic projection

When `columns` is omitted, ImportJSON MUST project rows automatically according to these rules:

- nested objects are recursively flattened;
- an empty object contributes no automatic column;
- the schema is the union of discovered properties;
- headers are full JSON Pointers sorted by Unicode code-point order;
- if every unshaped selected record is a non-object, the only header is `@value`;
- if unshaped selected records mix at least one object with at least one non-object, the invocation produces `HETEROGENEOUS_RECORDS`.

`HETEROGENEOUS_RECORDS` does not apply to heterogeneous logical rows produced by an explicit shaping operation.

If automatic projection cannot discover any header, the rendered Sheets result is one blank cell.

## 7. Explicit projection with `columns`

An explicit projection is an ordered list of non-empty JSON Pointers.

The Sheets adapter accepts either:

- one JSON Pointer string; or
- a one-dimensional horizontal or vertical range of JSON Pointer strings.

A two-dimensional rectangular range, blank pointer, invalid JSON Pointer, or duplicate pointer produces `INVALID_ARGUMENT`.

With explicit projection:

- only the requested columns appear;
- pointer order is preserved exactly;
- a missing property is represented internally as missing;
- projection is resolved after shaping.

A present empty object explicitly projected at a pointer is a structured value and renders as `{}`.

If the selection or shaping produces no rows, explicit headers are still returned.

## 8. Structured values

An array or object that reaches a cell without further flattening or shaping MUST be serialized as compact deterministic JSON:

- no formatting whitespace;
- array order preserved;
- object member names sorted recursively by Unicode code point.

Strings MUST be preserved without implicit trimming or date conversion. Booleans remain booleans. Numbers follow JavaScript `Number` semantics.

## 9. `shape`

`shape` is optional. When omitted, selected records are tabularized without an additional structural transformation.

When supplied, `shape` MUST resolve to one non-empty string containing exactly one of:

- `columnar`; or
- an RFC 6901 JSON Pointer relative to each selected record.

Any other form produces `INVALID_ARGUMENT`.

## 10. Shaping through a JSON Pointer

A JSON Pointer `shape` targets one array within each selected record.

For each selected record:

- a non-empty target array produces one logical row per element, in array order;
- an empty target array produces zero rows;
- a missing target produces one row with the target missing;
- a `null` target produces one row with the target equal to `null`;
- an existing non-array, non-`null` target produces `INVALID_EXPANSION_TARGET` for the invocation.

Properties outside the target subtree MUST be repeated for each produced row. The current array element conceptually replaces the target before projection and flattening.

No nested array is expanded a second time. There is no implicit second shaping operation and no implicit Cartesian product.

For automatic projection after pointer shaping, the schema is the deterministic union of:

- properties discoverable outside the target subtree; and
- properties observed in produced rows at or below the target.

Outside headers MAY therefore remain known when all targeted arrays are empty. Child headers MUST NOT be invented without an observed value.

## 11. `columnar` shaping

`columnar` explicitly transforms an object-of-arrays representation into row-oriented logical records.

For every selected record:

- the record MUST be an object, otherwise `INVALID_COLUMNAR_TARGET`;
- it MUST contain at least one direct array property, otherwise `INVALID_COLUMNAR_TARGET`;
- every direct array property participates in the row axis;
- all direct arrays in that object MUST have identical lengths, otherwise `COLUMN_LENGTH_MISMATCH`;
- row `i` uses element `i` from every direct array;
- every direct non-array property is repeated unchanged for every produced row;
- matching empty direct arrays produce zero rows.

A completely empty selection is valid with `columnar`, because there is no selected record to validate.

When multiple selected records are present, each is transformed independently. Produced rows are concatenated in selection order. Different selected records MAY produce different row counts; equal length is required only among sibling direct arrays in the same record.

Elements of direct arrays MAY be strings, numbers, booleans, `null`, objects, or arrays. After row construction, normal projection and flattening apply. Object elements are flattened normally. Array elements remain structured serialized values and are not recursively shaped.

Only direct array properties of the selected object participate in `columnar`. Arrays nested inside direct object properties do not define another row axis.

`columnar` MUST NOT:

- be activated heuristically;
- truncate arrays;
- pad arrays;
- create a Cartesian product;
- apply a second implicit shaping operation.

For automatic projection, direct non-array properties remain discoverable even when all direct arrays are empty. Properties contributed only by array elements can be discovered only from produced rows.

## 12. `refreshKey`

`refreshKey` is ignored by the data engine but participates in Sheets formula dependency tracking.

A blank placeholder MAY be used for earlier optional arguments when `refreshKey` is supplied:

```text
IMPORTJSON(A1, , , , B1)
```

Public documentation MUST NOT recommend volatile functions such as `NOW()`, `RAND()`, or `RANDBETWEEN()` as a refresh mechanism.

ImportJSON does not maintain its own HTTP cache and does not guarantee that remote changes are observed until Google Sheets reevaluates the formula.

## 13. Rendering in Google Sheets

An invocation returns a two-dimensional matrix intended to spill into adjacent cells. The custom function MUST NOT directly write into other cells.

The renderer maps both internal missing values and JSON `null` to empty cells.

If there are no rows:

- explicit projection returns headers only;
- automatic projection returns known headers if shaping preserved discoverable outside schema;
- if no automatic header is known, the result is one blank cell.

A spill conflict caused by occupied destination cells is a Google Sheets error and is not remapped by ImportJSON.

## 14. Public errors

Public errors use a stable code followed by a readable message. The exact message text is not normative.

The public v1 codes implemented by ImportJSON are:

```text
INVALID_ARGUMENT
INVALID_URL
HTTP_ERROR
INVALID_JSON
INVALID_JSONPATH
HETEROGENEOUS_RECORDS
INVALID_EXPANSION_TARGET
INVALID_COLUMNAR_TARGET
COLUMN_LENGTH_MISMATCH
```

`INVALID_COLUMNAR_TARGET` means that `columnar` received a selected record that is not an object or has no direct array property. `COLUMN_LENGTH_MISMATCH` means sibling direct arrays in one selected `columnar` record have unequal lengths.

Errors MUST NOT expose native stack traces or remote response bodies through normal public adapter messages.

## 15. Platform limits

ImportJSON runs within Google Apps Script and Google Sheets. Platform execution, service, cell, and spill limits therefore apply.

The current v1 implementation defines an explicit 20-second HTTP timeout but does not define additional ImportJSON-specific public error codes for platform size, depth, row-count, column-count, or execution limits.

No platform-limit failure is specified as a successful truncated table.

## 16. Scope

The public v1 API consists only of `IMPORTJSON` with the arguments and behavior defined above. It does not define additional option languages, automatic date conversion, automatic recursive array expansion, joins between sources, JSON writing, custom HTTP methods, or a second public table function.

## References

- BCP 14 — Requirement Levels
- RFC 2119 / RFC 8174 — Requirement Levels
- RFC 8259 — JSON
- RFC 9535 — JSONPath
- RFC 6901 — JSON Pointer
- Google Apps Script — Custom Functions in Google Sheets
