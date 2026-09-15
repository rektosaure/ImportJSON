# ImportJSON

ImportJSON is a Google Sheets custom function that fetches one JSON document from an HTTP or HTTPS URL and turns selected JSON values into a table.

It uses standard JSON tools: JSONPath (RFC 9535) selects nodes, JSON Pointer (RFC 6901) identifies columns, and an optional `shape` argument performs one explicit structural transformation when nested data needs to become rows.

## Install

Each ImportJSON release is distributed as an immutable Apps Script Library version plus a small wrapper.

1. Open the [latest GitHub release](https://github.com/rektosaure/ImportJSON/releases/latest).
2. Open its `release-manifest.json` asset and note `appsScript.scriptId` and `appsScript.version`.
3. In the Google Sheet, choose **Extensions → Apps Script**.
4. Next to **Libraries**, choose **Add a library**, paste the Script ID from the manifest, and choose **Look up**.
5. Select the Apps Script version from the manifest, set the Library identifier to `ImportJSONLib`, and add the Library.
6. Download `ImportJSON.gs` from that same GitHub release and copy it into the bound Apps Script project.
7. Save the project and return to the sheet.

Always use the wrapper and Apps Script version from the same release. Do not install files directly from a development branch.

## Quick start

```text
IMPORTJSON(url, [query], [columns], [shape], [refreshKey])
```

If `A1` contains the URL of a JSON array such as:

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

Project one JSON Pointer directly, or place several pointers in a one-dimensional cell range:

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

## Documentation

See the [User Guide](docs/user-guide.md) for the complete practical reference: arguments, selection, projection, shaping, rendering, errors, limits, recipes, and end-to-end examples.

To contribute, start with [CONTRIBUTING.md](CONTRIBUTING.md). The contributor guide points to the normative specification and maintainer documentation when needed.

## License

ImportJSON is licensed under the MIT License. See [LICENSE](LICENSE).
