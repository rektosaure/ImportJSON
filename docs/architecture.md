# ImportJSON — Architecture

This document describes implementation boundaries and runtime integration. Observable product behavior belongs in the [Functional Specification](functional-specification.md), which is authoritative if the documents conflict.

## 1. Boundaries

The product flow is:

```text
HTTP/HTTPS URL
    ↓
Apps Script adapter
    ↓
JSON text
    ↓
core selection / shaping / projection
    ↓
logical table
    ↓
Apps Script rendering
    ↓
Google Sheets
```

The public surface is one Google Sheets function, `IMPORTJSON`.

### Core

`src/core.mjs` owns behavior that is independent of Google Sheets and Apps Script:

- JSON parsing;
- JSONPath selection;
- JSON Pointer resolution;
- record shaping;
- automatic and explicit projection;
- flattening and structured-value serialization.

The core is tested in standard JavaScript and does not depend on Apps Script services.

### Apps Script adapter

`src/apps-script.mjs` owns the platform boundary:

- normalization of Sheets argument shapes;
- URL validation and HTTP acquisition through `UrlFetchApp`;
- conversion of the core table to the matrix returned to Sheets.

The adapter does not implement selection, shaping, or projection semantics. Those rules remain in the core and are defined normatively by the functional specification.

## 2. JSONPath runtime integration

ImportJSON uses `json-p3@2.3.0` for RFC 9535 evaluation and `re2js@2.8.6` for the standard `match()` and `search()` functions.

`src/jsonpath.mjs` creates the product JSONPath environment through public `json-p3` extension points:

- `entries` supplies deterministic object-member traversal where RFC 9535 permits multiple orders;
- `functionRegister` supplies RE2JS-backed `match()` and `search()`.

The production bundle targets Google Apps Script V8. Apps Script does not provide the `TextEncoder` required by one `json-p3` code path, so `scripts/build.mjs` injects the narrowly scoped ASCII-only shim in `src/apps-script-text-encoder.mjs`.

The integration must remain compatible with Apps Script V8 without Node.js runtime globals or dynamic code generation.

### Qualification

`test/jsonpath.test.mjs` is the executable qualification for this integration. It pins the RFC 9535 compliance fixture and verifies the complete suite, deterministic ordering, the RE2JS overrides, the `TextEncoder` assumption and shim, and the exact built production Library bundle in an Apps Script-like runtime.

Dependency or integration changes must keep that qualification passing. Test coverage is the source of truth for the individual checks; this document records only why the qualification boundary exists.

## 3. Build and distribution

`scripts/build.mjs` produces the standalone Apps Script Library files in `build/`:

```text
build/importjson-library.gs
build/appsscript.json
build/json-p3-LICENSE
build/re2js-LICENSE
```

`build/` is generated and is not committed.

`src/apps-script-globals.js` is appended to the bundle so the standalone Library exposes `IMPORTJSON(...)` in Apps Script. `dist/ImportJSON.gs` is the small user-facing wrapper copied into the consuming spreadsheet project; it delegates to the published Library through the identifier `ImportJSONLib`.

The Library bundle and wrapper intentionally remain separate artifacts. The release workflow tests and builds the selected `main` commit, then publishes those exact outputs without a second build step.

## 4. Change discipline

Public selection, shaping, projection, argument handling, rendering, and error semantics belong in the functional specification and corresponding automated tests, not in this document.

Architecture documentation should change only when technical boundaries, runtime integration, build structure, or distribution invariants change.
