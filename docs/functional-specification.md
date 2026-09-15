# ImportJSON — Functional Specification

**Target:** Google Sheets / Google Apps Script

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
IMPORTJSON(url, [query], [columns], [shape], [refresh])
```

For `query`, `columns`, and `shape`, an empty string is equivalent to omitting that argument. This applies to a literal empty string and to a single-cell value that is empty, regardless of whether later optional arguments are present. A blank entry inside a multi-cell `columns` range is not an omitted argument and remains invalid.

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

## 3. `url`, HTTP acquisition, and cache

`url` MUST resolve to a non-empty absolute `http:` or `https:` URL. It MAY be supplied as a literal value or a single-cell reference.

A multi-cell range used as `url` produces `INVALID_ARGUMENT`. An invalid URL or unsupported scheme produces `INVALID_URL`.

ImportJSON maintains a best-effort cache of successful HTTP response bodies. Cache identity is the exact URL string accepted after single-cell extraction and URL validation. ImportJSON does not canonicalize URLs for cache identity: textually different URL strings use different entries even if an origin would treat them as equivalent. `query`, `columns`, `shape`, and `refresh` do not participate in cache identity.

When cache lookup is permitted and an entry is available, the adapter MAY satisfy the invocation without a network request. A missing, expired, evicted, oversized, unavailable, or otherwise unusable cache entry MUST be treated as a normal cache miss and MUST NOT introduce a new public error.

On cache miss, or when `refresh` requires a fresh request, the adapter MUST perform at most one GET request for the invocation, follow redirects, and accept only a final `2xx` response as success. A network failure, timeout, or final non-`2xx` response produces `HTTP_ERROR`.

The adapter uses a 20-second HTTP timeout.

The successful response body MUST parse as JSON. Otherwise the invocation produces `INVALID_JSON`.

A fetched response is eligible to populate the cache only after the invocation successfully completes JSON parsing, selection, shaping, and projection. Failed HTTP acquisition, invalid JSON, invalid JSONPath, shaping errors, and other failed transformations MUST NOT populate the cache with the fetched body.

The default requested cache lifetime is 3600 seconds. This is an upper bound requested from the platform rather than a persistence guarantee: Apps Script MAY evict an entry earlier.

ImportJSON MUST NOT store a fetched response when any of the following is present:

- `Cache-Control: no-store`;
- `Cache-Control: no-cache`;
- `Cache-Control: private`;
- `Vary: *`.

For shared-cache freshness, `s-maxage` takes precedence over `max-age` when present. An effective `s-maxage` or `max-age` of `0` disables storage. A positive effective value shorter than 3600 seconds shortens the requested cache lifetime. A larger value does not extend the lifetime beyond 3600 seconds.

When a fresh successful HTTP response forbids shared storage under these rules, ImportJSON SHOULD remove any prior cache entry for the same URL on a best-effort basis.

Cache reads, writes, removals, platform eviction, and cache-size limits are optimization details and MUST NOT change the table produced from a given response body.

ImportJSON does not accept raw JSON text in place of `url` through the public Sheets function.

## 4. `query` and JSONPath selection

After omission normalization, a supplied `query` MUST resolve to a non-empty string containing an RFC 9535 JSONPath expression. A non-string value or multi-cell range produces `INVALID_ARGUMENT`. Invalid JSONPath syntax produces `INVALID_JSONPATH`.

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

The RFC 6901 empty pointer denotes the whole value, but the public Sheets API reserves an empty string as an omitted `columns` or `shape` argument. Public JSON Pointer arguments are therefore non-empty and begin with `/`.

## 6. Automatic projection

When `columns` is omitted, ImportJSON MUST project every logical row with the same rules:

- object rows are recursively flattened into JSON Pointer columns;
- an empty object contributes no automatic column;
- non-object rows contribute the synthetic column `@value`;
- arrays and objects that reach a cell are serialized according to Section 8;
- the schema is the union of columns contributed by all logical rows that exist after shaping;
- automatic headers, including `@value`, are sorted by Unicode code-point order.

Object and non-object logical rows MAY coexist in the same automatic projection. Missing cells are represented internally as missing values.

If automatic projection cannot discover any header, the rendered Sheets result is one blank cell.

## 7. Explicit projection with `columns`

An explicit projection is an ordered list of non-empty JSON Pointers.

After omission normalization, the Sheets adapter accepts either:

- one JSON Pointer string; or
- a one-dimensional horizontal or vertical range of JSON Pointer strings.

A two-dimensional rectangular range, a blank pointer within a multi-cell range, invalid JSON Pointer, or duplicate pointer produces `INVALID_ARGUMENT`.

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

After omission normalization, a supplied `shape` MUST resolve to one non-empty string containing exactly one of:

- `columnar`; or
- a non-empty RFC 6901 JSON Pointer relative to each selected record.

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

For automatic projection after pointer shaping, the schema is the deterministic union of columns contributed by the produced logical rows. If shaping produces zero rows, automatic projection has no schema. Use explicit `columns` when headers must remain present without data rows.

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

Automatic projection derives columns only from produced logical rows. If matching direct arrays are empty and therefore produce no rows, automatic projection has no schema.

## 12. `refresh`

`refresh` controls cache lookup for the current evaluation and also participates normally in Google Sheets formula dependency tracking.

After single-cell normalization:

- omitted, blank, `FALSE`, or numeric `0` means normal cache behavior;
- `TRUE` or numeric `1` bypasses cache lookup and requires a fresh HTTP GET for that evaluation;
- any other value or a multi-cell range produces `INVALID_ARGUMENT`.

Earlier optional arguments MAY be left blank when `refresh` is supplied because empty `query`, `columns`, and `shape` values are always treated as omitted:

```text
IMPORTJSON(A1, , , , B1)
```

`refresh` does not change cache identity. A successful cache-eligible refresh replaces the existing cached response for the URL. A failed network request or failed data transformation does not replace the previous cached response. A fresh response that forbids shared caching under Section 3 removes the prior entry on a best-effort basis.

If `refresh` remains `TRUE` or `1`, every later Sheets reevaluation of that formula bypasses cache lookup again. A checkbox therefore works naturally as a manual refresh control: switch it to `TRUE` to force a request, then back to `FALSE` to resume normal cache use.

Public documentation MUST NOT recommend volatile functions such as `NOW()`, `RAND()`, or `RANDBETWEEN()` as a refresh mechanism.

## 13. Rendering in Google Sheets

An invocation returns a two-dimensional matrix intended to spill into adjacent cells. The custom function MUST NOT directly write into other cells.

The renderer maps both internal missing values and JSON `null` to empty cells.

If there are no rows:

- explicit projection returns headers only;
- automatic projection has no schema and returns one blank cell.

A spill conflict caused by occupied destination cells is a Google Sheets error and is not remapped by ImportJSON.

## 14. Public errors

Public errors use a stable code followed by a readable message. The exact message text is not normative.

The public error codes implemented by ImportJSON are:

```text
INVALID_ARGUMENT
INVALID_URL
HTTP_ERROR
INVALID_JSON
INVALID_JSONPATH
INVALID_EXPANSION_TARGET
INVALID_COLUMNAR_TARGET
COLUMN_LENGTH_MISMATCH
```

`INVALID_ARGUMENT` includes unsupported argument shapes and invalid `refresh` values.

`INVALID_COLUMNAR_TARGET` means that `columnar` received a selected record that is not an object or has no direct array property. `COLUMN_LENGTH_MISMATCH` means sibling direct arrays in one selected `columnar` record have unequal lengths.

Errors MUST NOT expose native stack traces or remote response bodies through normal public adapter messages.

## 15. Platform limits

ImportJSON runs within Google Apps Script and Google Sheets. Platform execution, service, cache, cell, and spill limits therefore apply.

The current implementation defines an explicit 20-second HTTP timeout and requests at most 3600 seconds of HTTP cache lifetime, but does not define additional ImportJSON-specific public error codes for platform size, depth, row-count, column-count, cache-value size, or execution limits.

A response that cannot be stored by Apps Script CacheService MUST still be processed normally. No platform-limit failure is specified as a successful truncated table.

## 16. Scope

The public API consists only of `IMPORTJSON` with the arguments and behavior defined above. It does not define additional option languages, automatic date conversion, automatic recursive array expansion, joins between sources, JSON writing, custom HTTP methods, authentication or credential storage, or a second public table function.

## References

- [BCP 14 / RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) — requirement levels
- [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259) — JSON
- [RFC 9535](https://www.rfc-editor.org/rfc/rfc9535) — JSONPath
- [RFC 6901](https://www.rfc-editor.org/rfc/rfc6901) — JSON Pointer
- [Google Apps Script — Custom Functions in Google Sheets](https://developers.google.com/apps-script/guides/sheets/functions)
- [Google Apps Script — Cache Service](https://developers.google.com/apps-script/reference/cache/cache-service)
