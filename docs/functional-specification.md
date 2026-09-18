# ImportJSON — Functional Specification

**Target:** Google Sheets / Google Apps Script

This document defines the observable behavior of ImportJSON. If it conflicts with [`architecture.md`](architecture.md), this specification is authoritative.

Each tagged release freezes the specification for that release. The copy on `dev` describes the current development state and may therefore include behavior that has not been published yet. `main` is the promoted release source.

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

The public model uses JSON (RFC 8259), JSONPath (RFC 9535), JSON Pointer (RFC 6901), and standard HTTP Authorization and caching semantics. It defines no proprietary query language.

After HTTP acquisition, JSON values follow JavaScript runtime semantics. Numeric source lexemes are not preserved and numbers use JavaScript `Number` semantics.

## 2. Public function

The only public Google Sheets function is:

```text
IMPORTJSON(url, [query], [columns], [shape], [cache], [authorization])
```

For `query`, `columns`, `shape`, and `authorization`, an empty string is equivalent to omitting that argument. This applies to a literal empty string and to a single-cell value that is empty, regardless of whether later optional arguments are present. A blank entry inside a multi-cell `columns` range is not an omitted argument and remains invalid.

The optional `cache` argument uses the modes defined in Section 12. An omitted or blank value selects the `default` mode.

The optional `authorization` argument uses the rules defined in Section 3. It is the complete value of one HTTP `Authorization` request header. ImportJSON does not interpret the authentication scheme.

The processing order is:

```text
HTTP request / cache
    ↓
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

## 3. `url`, HTTP acquisition, Authorization, and cache

`url` MUST resolve to a non-empty absolute `http:` or `https:` URL. It MAY be supplied as a literal value or a single-cell reference.

A multi-cell range used as `url` produces `INVALID_ARGUMENT`. An invalid URL or unsupported scheme produces `INVALID_URL`.

After omission normalization, a supplied `authorization` MUST resolve to one non-empty string containing no ASCII control character. A multi-cell range, non-string value, or value containing an ASCII control character produces `INVALID_ARGUMENT`. ImportJSON transmits the string exactly as the HTTP `Authorization` request-header value and does not parse, normalize, or validate its authentication scheme or credential syntax.

When `authorization` is supplied, `url` MUST use `https:`. An authenticated `http:` URL produces `INVALID_URL` before network acquisition.

ImportJSON maintains a best-effort cache of successful HTTP response bodies. Anonymous cache identity is the exact URL string accepted after single-cell extraction and URL validation. Authenticated cache identity is the exact Authorization value plus that exact URL string. ImportJSON does not canonicalize either component. Different Authorization values MUST NOT share one cache entry solely because their URLs match. `query`, `columns`, `shape`, and `cache` do not participate in cache identity.

When cache lookup is permitted and an entry is available for the current request identity, the adapter MAY satisfy the invocation without a network request. A missing, expired, evicted, oversized, unavailable, or otherwise unusable cache entry MUST be treated as a normal cache miss and MUST NOT introduce a new public error.

On cache miss, or when the selected cache mode requires fresh data, the adapter MUST start at most one Apps Script fetch operation for the invocation. That operation uses GET and accepts only a `2xx` response as success. Anonymous requests enable Apps Script automatic redirect following. Authenticated requests disable automatic redirect following; therefore an HTTP redirect response to an authenticated request reaches the normal non-`2xx` error path. A network failure, timeout, or accepted final non-`2xx` response produces `HTTP_ERROR`.

The adapter uses a 20-second HTTP timeout.

A successful fetched response body larger than 5 MiB (5,242,880 bytes) when measured as UTF-8 text produces `LIMIT_EXCEEDED`. The size check is applied after the HTTP response has been received and before JSON parsing or transformation.

The successful response body MUST parse as JSON. Otherwise the invocation produces `INVALID_JSON`.

A fetched response is eligible to populate the cache only when the selected cache mode permits storage and after the invocation successfully completes JSON parsing, selection, shaping, and projection. Failed HTTP acquisition, resource-limit checks, invalid JSON, invalid JSONPath, shaping errors, and other failed transformations MUST NOT populate the cache with the fetched body.

The default requested cache lifetime is 3600 seconds. This is an upper bound requested from the platform rather than a persistence guarantee: Apps Script MAY evict an entry earlier.

ImportJSON MUST NOT store a fetched response when any of the following is present:

- `Cache-Control: no-store`;
- `Cache-Control: no-cache`;
- `Cache-Control: private`;
- `Vary: *`.

For a response to a request containing `Authorization`, shared-cache storage additionally requires a `Cache-Control` response directive that permits shared caching of authenticated responses. ImportJSON recognizes `public`, `must-revalidate`, and `s-maxage` for this purpose. `max-age` alone does not permit storage of an authenticated response.

For shared-cache freshness, `s-maxage` takes precedence over `max-age` when present. An effective `s-maxage` or `max-age` of `0` disables storage. A positive effective value shorter than 3600 seconds shortens the requested cache lifetime. A larger value does not extend the lifetime beyond 3600 seconds. When storage is otherwise permitted and neither directive supplies an explicit lifetime, ImportJSON requests the default 3600-second lifetime.

When a fresh successful HTTP response is participating in cache handling and forbids shared storage under these rules, ImportJSON SHOULD remove any prior cache entry for the same request identity on a best-effort basis. The `off` mode defined in Section 12 does not participate in cache handling and therefore does not remove an existing entry.

Cache keys MUST NOT contain raw URL or Authorization text. The adapter hashes request identity before passing the derived key to CacheService. Hashing is an implementation measure for key representation and MUST NOT be presented as credential storage or confidentiality protection.

Cache reads, writes, removals, platform eviction, and cache-size limits are optimization details and MUST NOT change the table produced from a given response body.

ImportJSON does not accept raw JSON text in place of `url` through the public Sheets function. ImportJSON does not obtain, refresh, persist, or otherwise manage credentials; it only transmits the caller-supplied Authorization value for the current invocation.

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

## 12. `cache`

`cache` controls the HTTP cache policy for the current evaluation and also participates normally in Google Sheets formula dependency tracking.

After single-cell normalization, the supported values are case-sensitive:

- omitted, blank, or `"default"`: permit normal cache lookup for the current request identity; on a miss, fetch fresh data and store the fetched body when it is eligible;
- `"refresh"`: bypass cache lookup, require a fresh HTTP GET, and replace the existing cache entry for the current request identity when the fetched body is eligible;
- `"off"`: bypass cache lookup, require a fresh HTTP GET, and perform no cache read, write, or removal for the invocation;
- any other value or a multi-cell range produces `INVALID_ARGUMENT`.

Earlier optional arguments MAY be left blank when `cache` or `authorization` is supplied because empty `query`, `columns`, `shape`, and `authorization` values are treated as omitted:

```text
IMPORTJSON(A1, , , , "refresh")
IMPORTJSON(A1, , , , "off")
IMPORTJSON(A1, , , , "off", B1)
```

`cache` does not change cache identity. `authorization` does: anonymous requests and different exact Authorization values use distinct identities even when the URL is the same.

A failed network request or failed data transformation does not replace or remove a previous cached response.

In `refresh` mode, a fresh response that forbids shared caching under Section 3 removes the prior entry for that request identity on a best-effort basis. In `off` mode, any prior entry remains unchanged, so a later `default` invocation MAY reuse that older entry if it is still available.

If `cache` remains `"refresh"` or `"off"`, every later Sheets reevaluation of that formula requires a fresh HTTP GET. `refresh` updates normal cache state; `off` leaves normal cache state untouched.

Public documentation MUST NOT recommend volatile functions such as `NOW()`, `RAND()`, or `RANDBETWEEN()` as a cache-control mechanism.

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
LIMIT_EXCEEDED
```

`INVALID_ARGUMENT` includes unsupported argument shapes, invalid `cache` values, and invalid `authorization` values.

`INVALID_URL` includes an otherwise valid `http:` URL when `authorization` is supplied, because authenticated requests require HTTPS.

`INVALID_COLUMNAR_TARGET` means that `columnar` received a selected record that is not an object or has no direct array property. `COLUMN_LENGTH_MISMATCH` means sibling direct arrays in one selected `columnar` record have unequal lengths.

`LIMIT_EXCEEDED` means an ImportJSON resource limit defined in Section 15 was exceeded. ImportJSON MUST fail rather than silently truncate the response, selection, rows, columns, or rendered table.

Errors MUST NOT expose native stack traces, caller-supplied Authorization values, or remote response bodies through normal public adapter messages.

## 15. Resource and platform limits

ImportJSON applies fixed product limits before relying on Google Apps Script or Google Sheets to terminate an oversized computation:

- a freshly fetched response body MUST NOT exceed **5 MiB (5,242,880 bytes)** when measured as UTF-8 text;
- a parsed JSON document MUST NOT exceed **64 container levels** of nesting, where a root object or array is level 1;
- JSONPath selection MUST NOT produce more than **50,000 selected records**;
- shaping MUST NOT produce more than **50,000 logical rows**;
- explicit projection or the automatic schema union MUST NOT produce more than **500 columns**;
- a rendered table MUST NOT exceed **250,000 cells**, counting the header row and all data rows.

When a limit can be determined incrementally, ImportJSON SHOULD stop processing as soon as the limit is exceeded. Exceeding any of these limits produces `LIMIT_EXCEEDED` and MUST NOT produce a truncated successful table.

The one-blank-cell result produced when automatic projection discovers no schema is within the rendered-cell limit.

These limits bound ImportJSON behavior but do not replace platform limits. Google Apps Script and Google Sheets execution, service, cache, memory, cell, and spill limits also apply and MAY fail an invocation earlier.

The adapter additionally uses a 20-second HTTP timeout and requests at most 3600 seconds of HTTP cache lifetime.

A response that cannot be stored by Apps Script CacheService MUST still be processed normally when it otherwise satisfies the product limits. Cache-value size is not an ImportJSON table limit.

## 16. Scope

The public API consists only of `IMPORTJSON` with the arguments and behavior defined above. It does not define additional option languages, automatic date conversion, automatic recursive array expansion, joins between sources, JSON writing, custom HTTP methods, arbitrary request headers, OAuth flows, token refresh, credential storage, secret management, authenticated redirect following, or a second public table function.

The `authorization` argument is intentionally narrow: it supplies one HTTP `Authorization` request-header value for a direct HTTPS GET and does not create a general authentication or request-configuration subsystem.

## References

- [BCP 14 / RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) — requirement levels
- [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259) — JSON
- [RFC 9535](https://www.rfc-editor.org/rfc/rfc9535) — JSONPath
- [RFC 6901](https://www.rfc-editor.org/rfc/rfc6901) — JSON Pointer
- [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) — HTTP semantics and Authorization
- [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111) — HTTP caching, including authenticated requests
