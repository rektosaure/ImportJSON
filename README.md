# ImportJSON

**Bring JSON APIs into Google Sheets with one formula.**

[![CI](https://github.com/rektosaure/ImportJSON/actions/workflows/ci.yml/badge.svg)](https://github.com/rektosaure/ImportJSON/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/rektosaure/ImportJSON)](https://github.com/rektosaure/ImportJSON/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

ImportJSON is a lightweight, open-source Google Apps Script function that fetches JSON from an HTTP or HTTPS URL and turns it into a spreadsheet table.

Start with just a URL. Add JSONPath, explicit columns, shaping, cache control, or an HTTP Authorization value only when you need them. No add-on, external backend, or third-party account is required.

**[Open the live Google Sheets demo →](https://docs.google.com/spreadsheets/d/1H1J6LqyuioQ2c_PzOOWSLFe9NFdSl72yFo_Qn7h1dqw/edit)** — try JSONPath, column projection, cache modes, and the interactive playground with real formulas.

## A 10-second example

Given this JSON:

```json
[
  {"id": 1, "name": "Alpha"},
  {"id": 2, "name": "Beta"}
]
```

put the API URL in `A1` and use:

```gs
=IMPORTJSON(A1)
```

ImportJSON returns a normal Google Sheets table:

```text
/id   /name
1     Alpha
2     Beta
```

That is the default experience: one URL in, rows and columns out.

## Why ImportJSON?

- **Simple by default** — common JSON APIs work with just `=IMPORTJSON(url)`.
- **Precise when needed** — select records with standard JSONPath.
- **Choose your columns** — project fields with standard JSON Pointer, directly or from a cell range.
- **Handle nested data explicitly** — expand one nested array, reshape parallel arrays with `columnar`, or combine selected objects with `merge`.
- **Authenticate directly** — send one complete HTTP `Authorization` header value to HTTPS APIs when needed.
- **Avoid unnecessary requests** — eligible HTTP responses use a best-effort cache, with explicit modes for refreshing or bypassing it.
- **Predictable by design** — deterministic output, versioned releases, automated tests, and real-runtime smoke checks.

## Installation

Use files from a [GitHub release](https://github.com/rektosaure/ImportJSON/releases/latest), not from a development branch.

> [!NOTE]
> Documentation on `dev` describes the current development state and may include behavior that has not been published yet. `main` is the promoted release source. When exact behavior matters for an installed version, use the documentation from the matching Git tag.

### Apps Script Library — recommended

1. Open the [latest release](https://github.com/rektosaure/ImportJSON/releases/latest).
2. Note the Apps Script Library **Script ID** and **Version** shown in the release notes.
3. In your spreadsheet, open **Extensions → Apps Script**.
4. Add that immutable Library version and use the identifier `ImportJSONLib`.
5. Copy `ImportJSON.gs` from the same release into the spreadsheet's Apps Script project.
6. Save the project and return to your sheet.

The wrapper and Apps Script Library version must come from the same release.

### Manual installation

Prefer a self-contained installation instead?

1. Open the [latest release](https://github.com/rektosaure/ImportJSON/releases/latest).
2. Copy `importjson-library.gs` into the spreadsheet's bound Apps Script project.
3. Save the project and return to your sheet.

Do not add `ImportJSON.gs` in manual mode: the complete bundle already exposes `IMPORTJSON`.

## Quick reference

```text
IMPORTJSON(url, [query], [columns], [shape], [cache], [authorization])
```

| Argument | Use it for |
| --- | --- |
| `url` | The HTTP or HTTPS JSON endpoint. Authenticated requests require HTTPS. |
| `query` | Select records with JSONPath. |
| `columns` | Pick fields with JSON Pointer, or a one-dimensional range of pointers. |
| `shape` | Expand one nested array, use `columnar` for parallel arrays, or `merge` to combine selected objects. |
| `cache` | Blank/`default` for normal caching, `refresh` for fresh data that updates the cache, or `off` to bypass cache interaction. |
| `authorization` | Optional complete HTTP `Authorization` header value, such as `Bearer ...` or `Basic ...`. |

> [!TIP]
> Some Google Sheets locales use semicolons instead of commas as formula argument separators.

## Common recipes

### Import everything

```gs
=IMPORTJSON(A1)
```

If the JSON root is an array, each array element becomes a row. If it is an object, the root object becomes one record.

### Select records with JSONPath

```gs
=IMPORTJSON(A1, "$.users[*]")
```

Use this when the rows you want live below the JSON root.

### Pick one or more columns

One field:

```gs
=IMPORTJSON(A1, "$.users[*]", "/name")
```

Several fields from cells `D1:F1`:

```gs
=IMPORTJSON(A1, "$.users[*]", D1:F1)
```

For example, `D1:F1` might contain `/id`, `/name`, and `/email`.

### Expand one nested array

```gs
=IMPORTJSON(A1, , , "/items")
```

Each element of `/items` becomes its own row while values outside that array are repeated.

### Turn parallel arrays into rows

For JSON such as:

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

which produces:

```text
/group   /score   /year
A        18       2024
A        21       2025
```

### Merge selected objects

When sibling objects are parts of one logical record, select them with JSONPath and merge them explicitly:

```gs
=IMPORTJSON(A1, "$['profile','details']", , "merge")
```

All selected records must be objects with distinct direct property names. The merge is shallow; duplicate property names fail instead of being overwritten.

### Control the cache

Use `refresh` when you need fresh data now and want that result to become the normal cached value:

```gs
=IMPORTJSON(A1, , , , "refresh")
```

Use `off` when the evaluation should fetch fresh data without reading, writing, or clearing ImportJSON's cache:

```gs
=IMPORTJSON(A1, , , , "off")
```

You can also put blank, `default`, `refresh`, or `off` in `B1` and use:

```gs
=IMPORTJSON(A1, , , , B1)
```

See the [User Guide](docs/user-guide.md#http-cache-and-cache-modes) for the exact behavior, including authenticated-response caching and the fact that `off` leaves any older cached entry unchanged.

### Send an Authorization header

Put a complete Authorization value in `B1`, for example a Bearer value supplied by the API you are using, then call:

```gs
=IMPORTJSON(A1, , , , , B1)
```

Authenticated requests require HTTPS and do not automatically follow redirects. ImportJSON transmits the value but does not obtain, refresh, or securely store credentials. A credential placed in a Sheet cell or formula should not be treated as protected secret storage.

See the [User Guide](docs/user-guide.md#authentication-and-credentials) for cache and security details.

## Standards, without a proprietary query language

ImportJSON uses standard JSON and HTTP tools rather than inventing its own syntax:

- [JSONPath (RFC 9535)](https://www.rfc-editor.org/rfc/rfc9535) selects nodes and records;
- [JSON Pointer (RFC 6901)](https://www.rfc-editor.org/rfc/rfc6901) identifies fields and columns;
- standard HTTP `Authorization` and caching semantics govern authenticated requests.

The optional `shape` argument handles cases where nested JSON needs one explicit structural transformation before becoming rows.

## Documentation

- [Live Google Sheets demo](https://docs.google.com/spreadsheets/d/1H1J6LqyuioQ2c_PzOOWSLFe9NFdSl72yFo_Qn7h1dqw/edit) — interactive examples and a formula playground.
- [User Guide](docs/user-guide.md) — practical usage, recipes, cache and authentication guidance, common errors, and troubleshooting.
- [Functional Specification](docs/functional-specification.md) — authoritative observable behavior for the source version you are reading.
- [Security Policy](SECURITY.md) — supported security-fix scope and private vulnerability reporting.
- [Contributing](CONTRIBUTING.md) — development workflow and the index for contributor and maintainer documentation.

## License

ImportJSON is licensed under the [MIT License](LICENSE).
