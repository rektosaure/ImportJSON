# JSONPath Qualification

ImportJSON uses `json-p3@2.3.0` for RFC 9535 evaluation and `re2js@2.8.6` for `match()` and `search()`.

The product JSONPath environment is created by [`src/jsonpath.mjs`](../src/jsonpath.mjs). It uses the public `json-p3` `entries` and `functionRegister` extension points rather than modifying regex or traversal internals.

JSONPath qualification is part of the normal project test suite. It is not a separate build product.

## Qualification requirements

The automated qualification MUST verify:

- **704/704** cases from the pinned RFC 9535 compliance test suite;
- the fixture revision and SHA-256 checksum committed with the test data;
- preservation of selector-defined order and multiplicity;
- deterministic object-member traversal where RFC 9535 permits multiple member orders;
- reverse slices and duplicate selections;
- RE2JS-backed `match()` and `search()` through the public `functionRegister` API;
- invalid regex patterns producing no match rather than leaking a regex-engine exception;
- bundled execution without Node.js runtime globals that are unavailable in Apps Script;
- bundled execution without relying on `TextEncoder`;
- the real `src/apps-script.mjs` adapter bundle executing `match()` and `search()` in an Apps Script-like runtime.

The pinned CTS fixtures live under [`test/jsonpath/fixtures/`](../test/jsonpath/fixtures/). Tests MUST validate their documented checksum and case count rather than downloading a moving upstream branch during qualification.

## Reproduce the qualification

Node.js 22 or newer is required by the repository tooling.

```sh
npm ci
npm test
```

`npm test` builds the production Library bundle and runs all automated tests, including JSONPath qualification.

## Apps Script compatibility patch

The production build applies one source adaptation to pinned `json-p3@2.3.0`: hexadecimal escape parsing must not depend on `TextEncoder`, because Apps Script V8 does not expose that global.

The patch replaces that one encoding loop with direct character-code iteration. Every replacement fails explicitly if the expected pinned `json-p3` bundle shape changes.

The patch MUST NOT replace `match()` / `search()` internals, change selector traversal, or add ImportJSON-specific visit, budget, or deadline hooks. Those concerns are not required by the current product contract.

An upstream engine update therefore requires deliberate compatibility review and full requalification.

## Deterministic object traversal

ImportJSON installs an `entries` hook on the JSONPath environment that sorts object member names by Unicode code point.

This deterministic ordering MUST NOT override ordering that is explicitly determined by a selector. Qualification therefore covers both object wildcard behavior and selectors whose order is already defined, including unions, duplicates, and reverse slices.

## Apps Script release check

Before a public release, the exact candidate `build/importjson-library.gs` bundle SHOULD be smoke-tested in Google Apps Script V8.

The release record should identify the exact tested bundle revision or checksum and confirm at least that:

- the bundle loads in Apps Script V8;
- `IMPORTJSON` is exposed as the Library function;
- the qualification path reports all 704 CTS cases passing;
- deterministic ordering checks pass;
- `re2js@2.8.6` provides `match()` and `search()` behavior through the product JSONPath environment;
- the bundle does not rely on `TextEncoder`.

A qualification result for a different bundle does not qualify the release candidate.
