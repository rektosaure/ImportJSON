# ImportJSON

ImportJSON is a Google Sheets custom function that fetches one JSON document from an HTTP or HTTPS URL and turns selected JSON values into a table.

It uses standard JSON tools: [JSONPath (RFC 9535)](https://www.rfc-editor.org/rfc/rfc9535) selects nodes, [JSON Pointer (RFC 6901)](https://www.rfc-editor.org/rfc/rfc6901) identifies columns, and an optional `shape` argument performs one explicit structural transformation when nested data needs to become rows.

## Installation

Use artifacts from a GitHub release, not files from a development branch.

### Apps Script Library (recommended)

1. Open the [latest GitHub release](https://github.com/rektosaure/ImportJSON/releases/latest).
2. Open `release-manifest.json` and note `appsScript.scriptId` and `appsScript.version`.
3. In **Extensions → Apps Script**, add that immutable Library version with identifier `ImportJSONLib`.
4. Copy `ImportJSON.gs` from the same release into the spreadsheet's bound Apps Script project.
5. Save and return to the sheet.

The wrapper and Apps Script Library version must come from the same release.

### Manual installation

1. Open the [latest GitHub release](https://github.com/rektosaure/ImportJSON/releases/latest).
2. Copy `importjson-library.gs` into the spreadsheet's bound Apps Script project.
3. Save and return to the sheet.

Do not add `ImportJSON.gs` in manual mode: the complete bundle already exposes `IMPORTJSON`.

## Quick start

```text
IMPORTJSON(url, [query], [columns], [shape], [refresh])
```

If `A1` contains the URL of:

```json
[
  {"id": 1, "name": "Alpha", "details": {"active": true}},
  {"id": 2, "name": "Beta", "details": {"active": false}}
]
```

then:

```gs
=IMPORTJSON(A1)
```

returns:

```text
/details/active   /id   /name
TRUE              1     Alpha
FALSE             2     Beta
```

Some Google Sheets locales use semicolons instead of commas as formula argument separators.

## Common operations

Select records with JSONPath:

```gs
=IMPORTJSON(A1, "$.users[*]")
```

Project one JSON Pointer directly, or several pointers from a one-dimensional cell range:

```gs
=IMPORTJSON(A1, "$.users[*]", "/name")
=IMPORTJSON(A1, "$.users[*]", D1:F1)
```

Expand one nested array into rows:

```gs
=IMPORTJSON(A1, , , "/items")
```

Convert an object of parallel arrays into rows:

```gs
=IMPORTJSON(A1, , , "columnar")
```

Use a checkbox or boolean value in `B1` to force a fresh request for one evaluation:

```gs
=IMPORTJSON(A1, , , , B1)
```

`FALSE`, `0`, or blank uses the cache normally. `TRUE` or `1` bypasses cache lookup for that evaluation.

## HTTP cache

ImportJSON keeps eligible successful response bodies in a best-effort Apps Script cache for at most 10 minutes. Cache identity uses the exact URL string supplied to ImportJSON; `query`, `columns`, and `shape` do not participate.

In the recommended Library installation, that cache belongs to the Library and can be reused by different spreadsheets using the same Library. See the [User Guide](docs/user-guide.md#http-cache-refresh-and-sensitive-urls) before using signed, tokenized, private, or otherwise sensitive URLs.

## Documentation

- [User Guide](docs/user-guide.md) — installation, arguments, recipes, cache behavior, errors, and limits.
- [Functional Specification](docs/functional-specification.md) — normative observable behavior.
- [Architecture](docs/architecture.md) — implementation boundaries and runtime integration.
- [Contributing](CONTRIBUTING.md) — development workflow and documentation ownership.
- [Releasing](docs/releasing.md) — publication and release identity.

## License

ImportJSON is licensed under the MIT License. See [LICENSE](LICENSE).
