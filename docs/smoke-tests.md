# ImportJSON — Live Google Sheets Smoke Tests

This document defines the small set of checks that require the real Google Sheets / Apps Script runtime. Automated product behavior belongs in `npm test`; this suite verifies only the platform integration that Node.js cannot fully reproduce.

Run the suite after publication against both supported installation modes. Cases 1–7 use the immutable Apps Script Library version and `ImportJSON.gs` wrapper from the same GitHub Release. Case 8 is a minimal sanity check for the manual bundle installation.

## Setup

For cases 1–7:

1. Add the published Apps Script Library version to a disposable Google Sheet and use the identifier `ImportJSONLib`.
2. Copy the release's `ImportJSON.gs` wrapper into the bound Apps Script project.
3. Record the release tag and exact Git commit SHA as `<ref>`.
4. Replace `<ref>` in the fixture URLs below with that full commit SHA.
5. Use one-dimensional cell ranges for the `columns` cases exactly as described.

Repository fixture URLs:

```text
https://raw.githubusercontent.com/rektosaure/ImportJSON/<ref>/test/fixtures/smoke/array-root.json
https://raw.githubusercontent.com/rektosaure/ImportJSON/<ref>/test/fixtures/smoke/root-object.json
https://raw.githubusercontent.com/rektosaure/ImportJSON/<ref>/test/fixtures/smoke/rendering.json
https://raw.githubusercontent.com/rektosaure/ImportJSON/<ref>/test/fixtures/smoke/columnar.json
```

Case 7 uses the public httpbin test service only to verify real-runtime Authorization-header transmission and redirect handling. The credential in that case is fixed public test data, not a secret.

## Smoke matrix

### 1. Library, wrapper, cache boundary, fetch, and automatic spill

Use `root-object.json`:

```gs
=IMPORTJSON("<root-object-url>")
```

Expected table:

```text
/details/active   /id   /name
TRUE              1     Alpha
```

This verifies that the published Library and wrapper load in Apps Script, the CacheService/Utilities boundary does not prevent execution, `UrlFetchApp` can retrieve JSON on cache miss, a non-array root is handled correctly, and the returned matrix spills into Sheets. Detailed cache hit/miss semantics remain covered by automated tests because a Sheet result alone cannot prove whether a network request occurred.

### 2. JSONPath and one-dimensional `columns` range

Put `/name` and `/id` in a horizontal or vertical two-cell range, then use `array-root.json`:

```gs
=IMPORTJSON("<array-root-url>","$[*]",<range>)
```

Expected table:

```text
/name   /id
Alpha   1
Beta    2
```

This verifies literal JSONPath input plus the real Sheets range shape used by explicit projection.

### 3. `shape` through the public Sheets boundary

Use `columnar.json`:

```gs
=IMPORTJSON("<columnar-url>",,,"columnar")
```

Expected table:

```text
/group   /score   /year
A        18       2024
A        21       2025
```

This verifies that a later optional argument with blank positional placeholders reaches the adapter correctly and that shaped rows spill normally.

### 4. Rendering of blank and structured cells

Put `/id`, `/nullable`, `/missing`, and `/structured` in a one-dimensional range, then use `rendering.json`:

```gs
=IMPORTJSON("<rendering-url>",,<range>)
```

Expected table:

```text
/id   /nullable   /missing   /structured
1                           {"a":[2,1],"z":1}
2                           {"a":1,"b":2}
```

`null` and missing properties must render as blank Sheets cells, while structured values remain compact deterministic JSON strings.

### 5. Public error mapping

For a final non-`2xx` response, use a nonexistent fixture path under the same exact `<ref>`:

```gs
=IMPORTJSON("https://raw.githubusercontent.com/rektosaure/ImportJSON/<ref>/test/fixtures/smoke/does-not-exist.json")
```

The cell must fail with an ImportJSON error containing `HTTP_ERROR`, without exposing the remote body or a native stack trace.

For a successful response whose body is not JSON, use the repository README at the same exact `<ref>`:

```gs
=IMPORTJSON("https://raw.githubusercontent.com/rektosaure/ImportJSON/<ref>/README.md")
```

The cell must fail with an ImportJSON error containing `INVALID_JSON`.

### 6. `cache` modes through the public boundary

Put a blank value in `B1` and use `root-object.json`:

```gs
=IMPORTJSON("<root-object-url>",,,,B1)
```

With `B1` blank, the result must match case 1. Set `B1` to `refresh`; Sheets must reevaluate the formula and the result must still match case 1. Set `B1` to `off`; the result must still match case 1. Finally set `B1` to `default`; the result must remain unchanged.

This verifies the public fifth-argument path, supported string values supplied by a real Sheets cell, and dependency-driven reevaluation through the published Library. The automated adapter tests prove the distinct cache read/write semantics of `default`, `refresh`, and `off`.

### 7. Authorization header and authenticated redirect boundary

Use httpbin's documented Basic-auth endpoint with fixed public test credentials. This value is deliberately not a secret:

```text
Basic aW1wb3J0anNvbjpzbW9rZQ==
```

Call:

```gs
=IMPORTJSON("https://httpbin.org/basic-auth/importjson/smoke",,,,,"Basic aW1wb3J0anNvbjpzbW9rZQ==")
```

Expected table:

```text
/authenticated   /user
TRUE             importjson
```

Then replace the Authorization value with:

```text
Basic aW1wb3J0anNvbjp3cm9uZw==
```

The cell must fail with an ImportJSON error containing `HTTP_ERROR`, without exposing the supplied Authorization value or the remote body.

Finally call a redirect endpoint while supplying the valid test Authorization value:

```gs
=IMPORTJSON("https://httpbin.org/redirect/1",,,,,"Basic aW1wb3J0anNvbjpzbW9rZQ==")
```

The cell must fail with `HTTP_ERROR`. This verifies in the real Apps Script runtime that the public sixth argument reaches `UrlFetchApp`, that an Authorization header can authenticate a direct HTTPS request, and that authenticated requests do not automatically follow redirects.

### 8. Manual bundle installation

Use a second disposable Google Sheet with no ImportJSON Library and no `ImportJSON.gs` wrapper. In its bound Apps Script project, create a script file and replace its contents with the release's `importjson-library.gs` bundle, then save the project.

Use the same `root-object.json` URL as case 1:

```gs
=IMPORTJSON("<root-object-url>")
```

Expected table:

```text
/details/active   /id   /name
TRUE              1     Alpha
```

This verifies that the published complete bundle exposes the `IMPORTJSON` custom function directly in a bound Apps Script project and that its local Script Cache integration does not prevent execution. The complete behavior matrix is not repeated because both installation modes execute the same bundled implementation.

## Acceptance

A release passes the live smoke suite only when:

- cases 1–7 pass in the same Sheet using the immutable Library version and wrapper from that release;
- case 8 passes in a separate Sheet using only `importjson-library.gs` from that release;
- the release tag, exact Git commit, and Apps Script Library version are recorded with the result;
- no case unexpectedly exposes a native stack trace, caller-supplied Authorization value, or remote response body.
