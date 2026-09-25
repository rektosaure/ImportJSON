# ImportJSON User Guide

ImportJSON fetches one JSON document from an HTTP or HTTPS URL and turns selected JSON values into a Google Sheets table.

This guide focuses on practical use of the public `IMPORTJSON` function. The [Functional Specification](functional-specification.md) is authoritative for exact observable behavior. Documentation on `dev` describes the current development state; `main` is the promoted release source. For an installed release, use the documentation from the matching Git tag when exact behavior matters.

```text
IMPORTJSON(url, [query], [columns], [shape], [cache], [authorization])
```

Examples use commas as formula separators. Some Google Sheets locales require semicolons instead.

## Installation

Use one of the two release installation modes described in the [README](../README.md#installation):

- **Apps Script Library (recommended):** published Library plus the matching `ImportJSON.gs` wrapper;
- **manual installation:** the complete `importjson-library.gs` bundle in the spreadsheet's bound Apps Script project.

Always use artifacts from the same GitHub release. Do not combine the Library wrapper with the manual bundle.

The source URL must be reachable by Apps Script when a network request is needed, and the formula needs enough empty cells for its result to spill.

## How an import is processed

```text
HTTP URL + optional Authorization
    ↓
HTTP cache or fetch
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
| `url` | Absolute HTTP or HTTPS URL returning one JSON document. A literal string or one cell is accepted. Authenticated requests require HTTPS. |
| `query` | Optional RFC 9535 JSONPath expression. A literal string or one cell is accepted. |
| `columns` | Optional non-empty RFC 6901 JSON Pointer, or a horizontal/vertical range of pointers. |
| `shape` | Optional non-empty JSON Pointer identifying one array to expand, `"columnar"` for parallel arrays, or `"merge"` to combine selected objects. |
| `cache` | Optional cache mode: blank or `"default"` for normal cache behavior, `"refresh"` for fresh data that updates the cache, or `"off"` to bypass cache reads and writes. |
| `authorization` | Optional complete HTTP `Authorization` header value. A literal string or one cell is accepted. |

For `query`, `columns`, `shape`, and `authorization`, `""` and a blank single cell mean omitted. A blank entry inside a multi-cell `columns` range is invalid. A blank `cache` value means `"default"`.

Typical formulas:

```gs
=IMPORTJSON(A1)
=IMPORTJSON(A1, "$.users[*]")
=IMPORTJSON(A1, "$.users[*]", D1:F1)
=IMPORTJSON(A1, , , "/items")
=IMPORTJSON(A1, , , "columnar")
=IMPORTJSON(A1, "$['profile','details']", , "merge")
=IMPORTJSON(A1, , , , "refresh")
=IMPORTJSON(A1, , , , "off")
=IMPORTJSON(A1, , , , B1)
=IMPORTJSON(A1, , , , , C1)
```

## `url`

`url` must be a non-empty absolute `http://` or `https://` URL without whitespace. A multi-cell range is invalid.

ImportJSON may satisfy an invocation from its HTTP cache. Otherwise it starts one Apps Script fetch operation and accepts only a successful `2xx` response. Anonymous requests may follow an HTTP redirect chain. Authenticated requests do not automatically follow redirects, so a redirect response produces `HTTP_ERROR`.

Network failures, timeouts, and accepted non-`2xx` responses produce `HTTP_ERROR`. A successful response whose body is not valid JSON produces `INVALID_JSON`.

When `authorization` is supplied, the URL must use HTTPS. Authenticated HTTP requests are rejected before fetching.

## Authentication and credentials

The optional sixth argument is the complete value of one HTTP `Authorization` request header. ImportJSON does not interpret the authentication scheme.

For a Bearer credential stored in `B1`:

```gs
=IMPORTJSON(A1, , , , , "Bearer " & B1)
```

If `B1` already contains the complete header value:

```gs
=IMPORTJSON(A1, , , , , B1)
```

The same mechanism can carry other schemes such as Basic when the remote API expects them. ImportJSON sends the supplied value exactly after validating the argument shape and rejecting control characters.

Authenticated requests have two deliberate restrictions:

- the URL must use HTTPS;
- automatic HTTP redirects are disabled, so a `3xx` response produces `HTTP_ERROR` rather than forwarding the credential to an unvalidated redirect target.

ImportJSON is not a credential manager. It does not perform OAuth flows, obtain access tokens, refresh tokens, or persist credentials. A credential placed in a spreadsheet cell or formula is visible according to the spreadsheet's access model and must not be treated as protected secret storage. Prefer scoped, revocable credentials appropriate for the API you are calling.

## HTTP cache and cache modes

ImportJSON keeps eligible successful response bodies in a best-effort Apps Script cache for at most one hour. Google may evict entries earlier, and origins can disable or shorten storage through standard HTTP response headers. A response that cannot be cached is still processed normally.

For anonymous requests, cache identity is the exact URL string supplied to ImportJSON. For authenticated requests, identity additionally includes the exact Authorization value. It is not canonicalized, so textually different URLs or Authorization values use different cache entries. `query`, `columns`, and `shape` do not change cache identity, which lets formulas reuse the same downloaded JSON while transforming it differently within the same request identity.

Cache keys are hashes of request identity. The raw URL and Authorization value are not used as CacheService key text, but hashing does not make a sensitive URL, formula, credential, or response confidential.

The exact cache eligibility and freshness rules are defined in the [Functional Specification](functional-specification.md#3-url-http-acquisition-authorization-and-cache).

### Cache modes

The fifth argument selects one of three cache behaviors:

- blank or `"default"`: use an available cached response for the current request identity, otherwise fetch and cache an eligible response;
- `"refresh"`: bypass cache lookup, fetch fresh data, and replace the cached response for the current request identity when the new response is eligible;
- `"off"`: bypass cache lookup, fetch fresh data, and do not read, write, or remove an ImportJSON cache entry for that evaluation.

For a one-off fresh request that should become the new cached value:

```gs
=IMPORTJSON(A1, , , , "refresh")
```

For a request that should not participate in ImportJSON caching at all:

```gs
=IMPORTJSON(A1, , , , "off")
```

A cell can also control the mode. For example, put blank, `default`, `refresh`, or `off` in `B1` and use:

```gs
=IMPORTJSON(A1, , , , B1)
```

If `cache` remains `"refresh"` or `"off"`, later Sheets reevaluations continue to make fresh requests. The difference is that `refresh` updates normal cache state while `off` leaves it untouched.

`off` does not clear an older cached response. If you switch from `off` back to `default`, ImportJSON may reuse a prior cached entry for the same request identity if it is still available. Use `refresh` when you want the fresh result to become the normal cached result.

Only blank, `default`, `refresh`, and `off` are accepted. Boolean and numeric values such as `TRUE`, `FALSE`, `1`, and `0` are invalid. Do not use volatile functions such as `NOW()`, `RAND()`, or `RANDBETWEEN()` as cache controls.

### Authenticated-response caching

Because Library mode uses a cache shared by consuming scripts, ImportJSON treats it as a shared HTTP cache. Merely partitioning entries by Authorization value is not enough to make every authenticated response shared-cacheable.

A response to a request containing `Authorization` is cached only when its `Cache-Control` directives explicitly permit shared caching of authenticated responses. ImportJSON recognizes `public`, `s-maxage`, and `must-revalidate` for this purpose. `max-age` by itself does not permit storage of an authenticated response.

Restrictive directives remain authoritative: `private`, `no-store`, `no-cache`, `s-maxage=0`, `max-age=0`, and `Vary: *` can prevent storage according to the exact rules in the Functional Specification.

This means many authenticated APIs will be fetched on every evaluation unless the origin explicitly opts into shared caching. Use `cache="off"` when you want that no-cache behavior to be explicit and to avoid any cache interaction.

### Sensitive URLs

Cache scope depends on installation mode:

- in **Library mode**, Script Cache belongs to the Library and may be reused by different spreadsheets consuming that Library;
- in **manual mode**, Script Cache belongs to the spreadsheet's bound Apps Script project.

For signed, capability, tokenized, private, or otherwise sensitive URLs, prefer an origin that sends restrictive cache headers such as `private` or `no-store`, use `"off"` from the first request when ImportJSON caching is not appropriate, or use manual installation when project-local cache scope is required.

`"off"` prevents cache interaction for that evaluation but does not purge an entry created by an earlier cache-enabled invocation.

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

Omitting `query` has a convenient default:

- with an array root, each array element becomes one record;
- with any other root, the root becomes one record.

That means omitted `query` on an array root is not the same as explicitly writing `$`: `$` selects the root array itself as one value.

A query matching nothing is valid. Selection order and multiplicity are preserved.

## `columns`: JSON Pointer projection

`columns` identifies values relative to each logical row with [JSON Pointer RFC 6901](https://www.rfc-editor.org/rfc/rfc6901). Examples are `/id`, `/name`, and `/details/active`.

A property name containing `/` uses `~1`; a property name containing `~` uses `~0`. Property `a/b`, for example, is addressed as `/a~1b`.

A single pointer can be supplied directly:

```gs
=IMPORTJSON(A1, "$.users[*]", "/name")
```

For several columns, put pointers in a one-dimensional horizontal or vertical range. If `D1:F1` contains `/id`, `/name`, and `/details/active`:

```gs
=IMPORTJSON(A1, "$.users[*]", D1:F1)
```

Explicit projection preserves the pointer order you supply. Missing properties and JSON `null` render as empty cells.

The empty RFC 6901 pointer cannot be supplied through `columns`: Sheets uses an empty argument to mean “omitted”.

## Automatic projection and structured values

When `columns` is omitted, object rows are recursively flattened into JSON Pointer headers. Primitive values and arrays use the synthetic `@value` column. Columns discovered across all logical rows form one deterministic schema.

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

An array or object that reaches a cell is serialized as compact deterministic JSON. Strings are not trimmed or converted to dates; booleans remain booleans.

## `shape`

`shape` performs at most one explicit structural transformation after selection and before projection. It is a non-empty JSON Pointer identifying one array, the literal `"columnar"`, or the literal `"merge"`.

There is no automatic recursive array expansion or implicit Cartesian product.

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

Properties outside the target subtree repeat for each produced row. Nested arrays are not expanded a second time.

A missing or `null` target remains one row. An existing target that is not an array or `null` produces `INVALID_EXPANSION_TARGET`.

### `merge`: combine selected objects

Use `merge` when multiple selected objects are parts of one logical record. For example:

```json
{
  "profile": {"name": "Apple"},
  "details": {"symbol": "AAPL"}
}
```

Select both objects and merge them before projection:

```gs
=IMPORTJSON(A1, "$['profile','details']", , "merge")
```

Result:

```text
/name    /symbol
Apple    AAPL
```

Every selected record must be an object. The merge is shallow: nested objects and arrays remain unchanged until normal projection and flattening. Direct property names must be unique across the selected objects; a collision produces `MERGE_CONFLICT` instead of silently overwriting a value. An empty selection remains empty.

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

Direct array properties define one shared row axis and must have equal lengths. Direct non-array properties repeat on each row. Arrays nested inside object properties do not create another row axis.

Unequal sibling array lengths produce `COLUMN_LENGTH_MISMATCH`. A non-object record or object with no direct arrays produces `INVALID_COLUMNAR_TARGET`.

## Empty results, ordering, and spill behavior

With explicit `columns`, requested headers remain even when selection or shaping produces no rows. Without explicit columns, a result with no discoverable schema becomes one blank cell.

Row order follows selection and shaping order. Explicit columns preserve supplied order; automatic columns use deterministic ordering.

A spill conflict caused by occupied destination cells is a Google Sheets error rather than an ImportJSON error.

## Errors and limits

ImportJSON errors begin with a stable public code and a readable message. Common categories include invalid arguments or URLs, HTTP failures, invalid JSON or JSONPath, invalid shaping targets, and resource-limit failures.

The complete list of public error codes and the exact current resource limits belong to the [Functional Specification](functional-specification.md#14-public-errors). A limit failure returns `LIMIT_EXCEEDED`; ImportJSON does not silently return a truncated successful table.

Google Apps Script and Google Sheets platform limits still apply independently and may fail an invocation before an ImportJSON product limit is reached.

## Common mistakes

**Using JSONPath in `columns`.** `query` uses JSONPath such as `$.users[*]`; `columns` uses JSON Pointer such as `/name`.

**Expecting arrays to expand automatically.** Arrays remain structured values unless `shape` explicitly expands one array or `columnar` uses direct arrays as the row axis.

**Expecting selected objects to merge automatically.** Use `shape="merge"` explicitly, and ensure their direct property names do not collide.

**Treating `$` as omitted query on an array root.** `$` selects the root array itself; omitted `query` selects its elements as records.

**Expecting `off` to clear the cache.** `off` bypasses cache interaction for that evaluation and leaves any prior entry untouched. Use `refresh` to fetch fresh data and update normal cache state.

**Passing only a Bearer token when the API expects the complete Authorization value.** Include the scheme, for example `"Bearer " & B1`.

**Treating a Sheet cell as a secret store.** ImportJSON can transmit an Authorization value but does not protect credentials stored in formulas or cells.
