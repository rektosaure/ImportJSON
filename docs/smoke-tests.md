# ImportJSON — Live Google Sheets Smoke Tests

This document defines the real-runtime smoke suite for a release candidate. It complements `npm test`; it does not replace the automated core, adapter, JSONPath, and distribution tests.

Run this suite with the exact candidate Library bundle and `dist/ImportJSON.gs` wrapper that will be released. After publication, repeat it against the immutable Apps Script Library version recorded for the release.

## Setup

1. Add the candidate Apps Script Library to a disposable Google Sheet and use the identifier `ImportJSONLib`.
2. Copy the candidate `dist/ImportJSON.gs` wrapper into the bound Apps Script project.
3. Record the exact Git commit SHA under test as `<ref>`.
4. For repository-owned fixtures, replace `<ref>` in the URLs below with that full commit SHA.
5. Use one-dimensional cell ranges for the `columns` cases exactly as shown.
6. Force one uncached recalculation by supplying a unique fifth `refreshKey`, then restore the formulas without the key after validation.

Repository fixture URLs:

```text
https://raw.githubusercontent.com/rektosaure/ImportJSON/<ref>/test/fixtures/smoke/array-root.json
https://raw.githubusercontent.com/rektosaure/ImportJSON/<ref>/test/fixtures/smoke/root-object.json
https://raw.githubusercontent.com/rektosaure/ImportJSON/<ref>/test/fixtures/smoke/rendering.json
https://raw.githubusercontent.com/rektosaure/ImportJSON/<ref>/test/fixtures/smoke/columnar.json
```

## Core runtime cases

| Case | Formula / setup | Pass condition |
| --- | --- | --- |
| Base URL | `=IMPORTJSON("https://jsonplaceholder.typicode.com/users")` | 10 data rows are returned with the automatically discovered user columns. |
| JSONPath filter | `=IMPORTJSON("https://jsonplaceholder.typicode.com/users","$[?@.id <= 3]")` | Exactly the records with ids 1, 2, and 3 are returned. |
| Columns with omitted query | Put `/id`, `/name`, `/email` in a 1-D range and call `=IMPORTJSON("https://jsonplaceholder.typicode.com/users",,<range>)`. | 10 rows are returned with exactly those three headers in the requested order. |
| Columns with explicit query | Use the same range with `=IMPORTJSON("https://jsonplaceholder.typicode.com/users","$[*]",<range>)`. | The result matches the omitted-query projection. |
| JSONPath plus columns | Use the same range with `=IMPORTJSON("https://jsonplaceholder.typicode.com/users","$[?@.id <= 3]",<range>)`. | Exactly three rows are returned with ids 1, 2, and 3. |
| Pointer shaping | Put `/id`, `/title`, `/reviews/rating`, `/reviews/reviewerName` in a 1-D range and call `=IMPORTJSON("https://dummyjson.com/products?limit=2","$.products[*]",<range>,"/reviews")`. | Six review rows are produced from the two selected products. |
| Public errors | Exercise invalid JSONPath, unsupported `ftp:` URL, and a scalar pointer-shape target. | The errors contain `INVALID_JSONPATH`, `INVALID_URL`, and `INVALID_EXPANSION_TARGET`, respectively. |

## Focused public-surface cases

### 1. `columnar` shaping

Use the `columnar.json` fixture:

```gs
=IMPORTJSON("<columnar-url>",,,"columnar")
```

Expected table:

```text
/group   /score   /year
A        18       2024
A        21       2025
```

### 2. Omitted query on an object root

Use the `root-object.json` fixture:

```gs
=IMPORTJSON("<root-object-url>")
```

Expected table:

```text
/details/active   /id   /name
TRUE              1     Alpha
```

This verifies that an omitted query treats a non-array root as one selected record.

### 3. Explicit `$` on an array root

Use the `array-root.json` fixture:

```gs
=IMPORTJSON("<array-root-url>","$")
```

Expected table:

```text
@value
[{"id":1,"name":"Alpha"},{"id":2,"name":"Beta"}]
```

This must remain distinct from omitted query, which iterates the array elements as records.

### 4. Literal single-pointer projection

Use the `array-root.json` fixture:

```gs
=IMPORTJSON("<array-root-url>",,"/id")
```

Expected table:

```text
/id
1
2
```

This verifies the adapter path where `columns` is one literal JSON Pointer rather than a cell range.

### 5. `null` and missing properties render as blank cells

Use the `rendering.json` fixture. Put `/id`, `/nullable`, and `/missing` in a 1-D range, then call:

```gs
=IMPORTJSON("<rendering-url>",,<range>)
```

Expected table:

```text
/id   /nullable   /missing
1
2
```

Both JSON `null` and a missing property must render as empty Sheets cells.

### 6. Structured values render as deterministic compact JSON

Use the `rendering.json` fixture:

```gs
=IMPORTJSON("<rendering-url>",,"/structured")
```

Expected table:

```text
/structured
{"a":[2,1],"z":1}
{"a":1,"b":2}
```

Object keys must be recursively ordered and no formatting whitespace may be added.

### 7. Final non-2xx response maps to `HTTP_ERROR`

Use a nonexistent fixture path under the same exact `<ref>`:

```gs
=IMPORTJSON("https://raw.githubusercontent.com/rektosaure/ImportJSON/<ref>/test/fixtures/smoke/does-not-exist.json")
```

The cell must fail with an ImportJSON error containing `HTTP_ERROR`. The remote response body and native fetch details must not be exposed.

### 8. HTTP 2xx with non-JSON content maps to `INVALID_JSON`

Use the repository README at the same exact `<ref>`:

```gs
=IMPORTJSON("https://raw.githubusercontent.com/rektosaure/ImportJSON/<ref>/README.md")
```

The cell must fail with an ImportJSON error containing `INVALID_JSON`.

## Refresh-key pass

Rerun every smoke invocation with a unique fifth argument, for example `"smoke-<ref>"`, while preserving blank positional placeholders. The result or public error code must remain unchanged. Then restore the formulas without the temporary refresh key.

## Acceptance

A candidate passes the live smoke suite only when:

- every core and focused case passes in the same Sheet using the exact candidate wrapper and Library bundle;
- the exact candidate revision or bundle checksum is recorded with the result;
- no formula unexpectedly returns a native stack trace or remote response body;
- the post-publication run against the immutable Apps Script Library version produces the same results.
