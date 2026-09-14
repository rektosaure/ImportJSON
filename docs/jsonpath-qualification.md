# JSONPath Qualification

ImportJSON uses `json-p3@2.3.0` with the source patch in [`src/json-p3-patch.mjs`](../src/json-p3-patch.mjs) and `re2js@2.8.6` for RFC 9535 `match()` and `search()` behavior.

JSONPath qualification is part of the normal project test suite. It is not a separate build product.

## Qualification requirements

The automated qualification MUST verify:

- **704/704** cases from the pinned RFC 9535 compliance test suite;
- the fixture revision and SHA-256 checksum committed with the test data;
- preservation of selector-defined order and multiplicity;
- deterministic object-member traversal where RFC 9535 permits multiple member orders;
- reverse slices and duplicate selections;
- lazy traversal in the patched engine paths;
- visit and deadline hooks used by qualification probes;
- exact patch application to the pinned `json-p3@2.3.0` source;
- `re2js@2.8.6` execution for `match()` and `search()`;
- bundled execution without Node.js runtime globals that are unavailable in Apps Script;
- bundled execution without relying on `TextEncoder`.

The pinned CTS fixtures live under [`test/jsonpath/fixtures/`](../test/jsonpath/fixtures/). Tests MUST validate their documented checksum and case count rather than downloading a moving upstream branch during qualification.

## Reproduce the qualification

Node.js 22 or newer is required by the repository tooling.

```sh
npm ci
npm test
```

`npm test` builds the production Library bundle and runs all automated tests, including JSONPath qualification.

## ImportJSON patch

The production patch is applied by the build and is also applied by the qualification test.

Its current responsibilities are deliberately narrow:

1. remove the `TextEncoder` dependency from hexadecimal parsing;
2. use lazy selector resolution for the patched child and descendant paths;
3. expose visit and deadline checkpoints used by qualification probes;
4. cover variable-work selectors and filter candidates with those checkpoints;
5. replace JavaScript `RegExp` execution for `match()` and `search()` with `re2js` while preserving the required RFC 9535 behavior.

Every source replacement fails explicitly if the expected pinned `json-p3` bundle shape changes. An upstream engine update therefore requires deliberate patch review and full requalification.

The patch hooks demonstrate that the selected engine can support bounded traversal work. They do not, by themselves, define ImportJSON public resource-limit error codes; public product behavior is defined by the [Functional Specification](functional-specification.md).

## Deterministic object traversal

ImportJSON installs an `entries` hook on the JSONPath environment that sorts object member names by Unicode code point.

This deterministic ordering MUST NOT override ordering that is explicitly determined by a selector. Qualification therefore covers both object wildcard behavior and selectors whose order is already defined, including unions, duplicates, and reverse slices.

## Apps Script release check

Before a public release, the exact candidate `build/importjson-library.gs` bundle SHOULD be smoke-tested in Google Apps Script V8.

The release record should identify the exact tested bundle revision or checksum and confirm at least that:

- the bundle loads in Apps Script V8;
- `IMPORTJSON` is exposed as the Library function;
- the qualification smoke path reports all 704 CTS cases passing;
- deterministic ordering checks pass;
- `re2js@2.8.6` is used for `match()` and `search()`;
- the patched lazy-traversal and checkpoint probes behave as expected.

A qualification result for a different bundle does not qualify the release candidate.
