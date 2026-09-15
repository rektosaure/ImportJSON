# JSONPath Qualification

ImportJSON uses `json-p3@2.3.0` for RFC 9535 evaluation and `re2js@2.8.6` for `match()` and `search()`.

`src/jsonpath.mjs` creates the product JSONPath environment. `src/apps-script-text-encoder.mjs` provides the Apps Script build-time `TextEncoder` compatibility required by `json-p3` hexadecimal escape parsing.

JSONPath qualification is part of the normal project test suite.

## Requirements

Automated qualification MUST verify:

- **704/704** cases from the pinned RFC 9535 compliance test suite;
- the committed CTS fixture checksum and case count;
- selector-defined order and multiplicity;
- deterministic object-member traversal where RFC 9535 permits multiple orders;
- reverse slices and duplicate selections;
- RE2JS-backed `match()` and `search()` through `functionRegister`;
- invalid regex patterns producing no match;
- pinned `json-p3` use of `TextEncoder` limited to ASCII hexadecimal escape parsing;
- the Apps Script `TextEncoder` shim accepting ASCII and rejecting non-ASCII input;
- bundled execution without unavailable Node.js globals or a runtime-global `TextEncoder`;
- the real `src/apps-script.mjs` adapter executing `match()` and `search()` in an Apps Script-like runtime.

The pinned CTS fixtures live under [`test/jsonpath/fixtures/`](../test/jsonpath/fixtures/). Qualification uses the committed fixture rather than a moving upstream source.

## Reproduce

Node.js 22 or newer is required.

```sh
npm ci
npm test
```

`npm test` builds the production Library bundle and runs the complete automated qualification.

## Runtime compatibility

The production bundle injects an ASCII-only `TextEncoder` implementation for `json-p3` hexadecimal escape parsing. The shim is scoped to the bundled dependency path and rejects non-ASCII input.

The qualified JSONPath integration consists of:

- public `json-p3` environment extension points;
- RE2JS-backed `match()` and `search()`;
- deterministic `entries` ordering;
- the Apps Script `TextEncoder` shim.

There are no ImportJSON-specific traversal budgets, deadlines, or visit hooks.

Any dependency update MUST repeat the full qualification.

## Release check

Before a public release, the exact candidate `build/importjson-library.gs` bundle SHOULD be smoke-tested in Google Apps Script V8.

The release record should identify the tested revision or bundle checksum and confirm that:

- the bundle loads in Apps Script V8;
- `IMPORTJSON` is exposed as the Library function;
- all 704 CTS cases pass;
- deterministic ordering checks pass;
- `match()` and `search()` use RE2JS through the product JSONPath environment;
- the bundle does not require a runtime-global `TextEncoder`.

Qualification applies only to the exact tested bundle.
