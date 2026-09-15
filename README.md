# ImportJSON

ImportJSON is a Google Sheets custom function that fetches one JSON document from an HTTP or HTTPS URL and turns selected JSON values into a table.

It uses standard JSON tools: JSONPath (RFC 9535) selects nodes, JSON Pointer (RFC 6901) identifies columns, and an optional `shape` argument performs one explicit structural transformation when nested data needs to become rows.

## Install

ImportJSON v1 is distributed as an Apps Script Library plus a small wrapper.

For **v1.0.0**, use these exact Library settings:

| Setting | Value |
| --- | --- |
| Script ID | `1wxMRsFs1vZq5nj7c0rKQKHDJHMcsQQO9W2eGh3T8Yfg8BrsAmAOo1VEi` |
| Apps Script version | `2` |
| Library identifier | `ImportJSONLib` |

1. Open the Google Sheet, then choose **Extensions → Apps Script**.
2. Next to **Libraries**, choose **Add a library**.
3. Paste the Script ID above and choose **Look up**.
4. Select **Version 2**, set the identifier to `ImportJSONLib`, and add the Library.
5. Download `ImportJSON.gs` from the [v1.0.0 release](https://github.com/rektosaure/ImportJSON/releases/tag/v1.0.0) and copy it into the bound Apps Script project.
6. Save the project and return to the sheet.

Use the wrapper from the same GitHub release as the immutable Apps Script Library version. For later releases, the corresponding Apps Script version is recorded in the release's `release-manifest.json` asset.

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
