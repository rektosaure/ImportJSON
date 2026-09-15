# ImportJSON

**Bring JSON APIs into Google Sheets with one formula.**

[![CI](https://github.com/rektosaure/ImportJSON/actions/workflows/ci.yml/badge.svg)](https://github.com/rektosaure/ImportJSON/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/rektosaure/ImportJSON)](https://github.com/rektosaure/ImportJSON/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

ImportJSON is a lightweight, open-source Google Apps Script function that fetches JSON from an HTTP or HTTPS URL and turns it into a spreadsheet table.

Start with just a URL. Add JSONPath, explicit columns, shaping, or manual refresh only when you need them. No add-on, external backend, or third-party account is required.

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
- **Handle nested data explicitly** — expand one nested array or reshape an object of parallel arrays with `columnar`.
- **Avoid unnecessary requests** — eligible HTTP responses are cached for up to 1 hour, with an explicit refresh control when you need fresh data now.
- **Predictable by design** — deterministic output, versioned releases, automated tests, and a documented live Google Sheets smoke suite.

## Installation

Use files from a [GitHub release](https://github.com/rektosaure/ImportJSON/releases/latest), not from a development branch.

### Apps Script Library — recommended

1. Open the [latest release](https://github.com/rektosaure/ImportJSON/releases/latest).
2. Open `release-manifest.json` and note `appsScript.scriptId` and `appsScript.version`.
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
IMPORTJSON(url, [query], [columns], [shape], [refresh])
```

| Argument | Use it for |
| --- | --- |
| `url` | The HTTP or HTTPS JSON endpoint. |
| `query` | Select records with JSONPath. |
| `columns` | Pick fields with JSON Pointer, or a one-dimensional range of pointers. |
| `shape` | Expand one nested array, or use `columnar` for parallel arrays. |
| `refresh` | Set to `TRUE`/`1` to bypass the cache for that evaluation. |

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

### Refresh on demand

Put a checkbox in `B1`:

```gs
=IMPORTJSON(A1, , , , B1)
```

- blank, `FALSE`, or `0` uses the cache normally;
- `TRUE` or `1` skips cache lookup, performs a fresh GET, and refreshes the cached response when eligible.

This makes a checkbox a simple manual refresh control: switch it on to force a request, then switch it off to resume normal cache use.

## HTTP cache

ImportJSON keeps eligible successful response bodies in a best-effort Apps Script cache for at most **1 hour**. Google may evict entries earlier.

Cache identity uses the exact URL string supplied to ImportJSON. `query`, `columns`, and `shape` do not participate, so different formulas using the same URL can reuse the same downloaded JSON while transforming it differently.

ImportJSON also respects restrictive response directives such as `no-store`, `no-cache`, `private`, and `Vary: *`, plus shorter `s-maxage` or `max-age` freshness values.

In the recommended Library installation, the cache belongs to the Library and can be reused by different spreadsheets using that Library. Read the [User Guide](docs/user-guide.md#http-cache-and-refresh) before using signed, tokenized, private, or otherwise sensitive URLs.

## Standards, without a proprietary query language

ImportJSON uses standard JSON tools rather than inventing its own syntax:

- [JSONPath (RFC 9535)](https://www.rfc-editor.org/rfc/rfc9535) selects nodes and records;
- [JSON Pointer (RFC 6901)](https://www.rfc-editor.org/rfc/rfc6901) identifies fields and columns.

The optional `shape` argument handles the cases where nested JSON needs one explicit structural transformation before becoming rows.

## Documentation

- [User Guide](docs/user-guide.md) — installation, arguments, recipes, cache behavior, errors, and limits.
- [Functional Specification](docs/functional-specification.md) — exact observable behavior.
- [Architecture](docs/architecture.md) — implementation boundaries and runtime integration.
- [Live smoke tests](docs/smoke-tests.md) — checks that require the real Google Sheets / Apps Script runtime.
- [Contributing](CONTRIBUTING.md) — development workflow and contribution guidance.
- [Releasing](docs/releasing.md) — publication and release identity.

## License

ImportJSON is licensed under the [MIT License](LICENSE).
