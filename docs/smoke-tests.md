# ImportJSON — Live Google Sheets Smoke Tests

This document defines the small set of checks that require the real Google Sheets / Apps Script runtime. Automated product behavior belongs in `npm test`; this suite verifies only the platform integration that Node.js cannot fully reproduce.

Run the suite after publication against both supported installation modes. Cases 1–6 use the immutable Apps Script Library version and `ImportJSON.gs` wrapper from the same GitHub Release. Case 7 is a minimal sanity check for the manual bundle installation.

## Setup

For cases 1–6:

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

## Smoke matrix

### 1. Library, wrapper, fetch, and automatic spill

Use `root-object.json`:

```gs
=IMPORTJSON("<root-object-url>")
```

Expected table:

```text
/details/active   /id   /name
TRUE              1     Alpha
```

This verifies that the published Library and wrapper load in Apps Script, `UrlFetchApp` can retrieve JSON, a non-array root is handled correctly, and the returned matrix spills into Sheets.

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

### 6. `refreshKey` dependency path

Repeat case 1 with a unique fifth argument while preserving the blank positional placeholders:

```gs
=IMPORTJSON("<root-object-url>",,,,"smoke-<ref>")
```

The result must be identical to case 1. This verifies the public fifth-argument path without duplicating the complete smoke matrix.

### 7. Manual bundle installation

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

This verifies that the published complete bundle exposes the `IMPORTJSON` custom function directly in a bound Apps Script project. The complete behavior matrix is not repeated because both installation modes execute the same bundled implementation.

## Acceptance

A release passes the live smoke suite only when:

- cases 1–6 pass in the same Sheet using the immutable Library version and wrapper from that release;
- case 7 passes in a separate Sheet using only `importjson-library.gs` from that release;
- the release tag, exact Git commit, and Apps Script Library version are recorded with the result;
- no case unexpectedly exposes a native stack trace or remote response body.
