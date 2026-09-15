# ImportJSON — Architecture

This document describes implementation boundaries and runtime integration. Observable product behavior belongs in the [Functional Specification](functional-specification.md), which is authoritative if the documents conflict.

## 1. Boundaries

The product flow is:

```text
HTTP/HTTPS URL
    ↓
Apps Script adapter / HTTP cache
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
- best-effort HTTP response caching through `CacheService`;
- cache-key hashing through `Utilities`;
- conversion of the core table to the matrix returned to Sheets.

The adapter does not implement selection, shaping, or projection semantics. Those rules remain in the core and are defined normatively by the functional specification.

## 2. HTTP cache runtime integration

The cache stores raw HTTP response bodies. Every cached body still passes through the core, so JSONPath selection, shaping, and projection are evaluated independently on each invocation.

Request identity currently consists only of the exact URL string accepted by the adapter. The implementation does not canonicalize that identity. Cache keys use a versioned SHA-256 digest rather than the raw URL.

The cache uses `CacheService.getScriptCache()`:

- Library mode uses the Library-owned Script Cache shared by consuming scripts;
- manual mode uses the bound Apps Script project's Script Cache.

This changes cache scope and hit rate, not table semantics. User-facing guidance for sensitive URLs belongs in the [User Guide](user-guide.md#sensitive-urls).

Fetched bodies are written only after the core successfully parses and transforms them. Cache access is best effort: failures, eviction, quota pressure, and oversized values fall back to normal HTTP behavior without a cache-specific public error.

The adapter requests at most 3600 seconds of cache lifetime, honors the restrictive shared-cache rules in the functional specification, and uses no compression, chunking, persistence layer, or `LockService` coordination. `refresh=TRUE` or `1` bypasses lookup but keeps the same cache key; an eligible successful refresh replaces the existing entry.

ImportJSON currently has no authentication subsystem. Future authenticated requests must extend request identity before using this shared cache so different authentication contexts cannot share an entry solely because their URLs match.

## 3. JSONPath runtime integration

ImportJSON uses `json-p3@2.3.0` for RFC 9535 evaluation and `re2js@2.8.6` for the standard `match()` and `search()` functions.

`src/jsonpath.mjs` creates the product JSONPath environment through public `json-p3` extension points:

- `entries` supplies deterministic object-member traversal where RFC 9535 permits multiple orders;
- `functionRegister` supplies RE2JS-backed `match()` and `search()`.

The production bundle targets Google Apps Script V8. Apps Script does not provide the `TextEncoder` required by one `json-p3` code path, so `scripts/build.mjs` injects the narrowly scoped ASCII-only shim in `src/apps-script-text-encoder.mjs`.

The integration must remain compatible with Apps Script V8 without Node.js runtime globals or dynamic code generation.

### Qualification

`test/jsonpath.test.mjs` is the executable qualification for this integration. It pins the complete RFC 9535 compliance fixture and requires every case except two upstream `match()` expectations that interpret `^` and `$` as anchors, contrary to their `NormalChar` status in RFC 9485. Those two divergences are asserted explicitly, while local regression tests verify the RFC 9485 literal-character behavior for `match()` and `search()`. The qualification also verifies deterministic ordering, the RE2JS overrides, the `TextEncoder` assumption and shim, and the exact built production Library bundle in an Apps Script-like runtime.

Dependency or integration changes must keep that qualification passing. Test coverage is the source of truth for the individual checks; this document records only why the qualification boundary exists.

## 4. Build and distribution

`scripts/build.mjs` produces the generated build inputs in `build/`:

```text
build/importjson-library.gs
build/appsscript.json
build/THIRD_PARTY_LICENSES.txt
```

`build/` is generated and is not committed. `appsscript.json` is the internal Apps Script project manifest used for Library publication, while `THIRD_PARTY_LICENSES.txt` consolidates the notices for dependencies bundled into the generated code.

`src/apps-script-globals.js` is appended to the bundle so the standalone Library exposes `IMPORTJSON(...)` in Apps Script. `dist/ImportJSON.gs` is the small user-facing wrapper copied into the consuming spreadsheet project; it delegates to the published Library through the identifier `ImportJSONLib`.

The Library bundle and wrapper intentionally remain separate installable artifacts. The release workflow tests and builds the selected `main` commit, then publishes those exact outputs without a second build step. The exact public release asset set is documented in [Releasing](releasing.md).

## 5. Change discipline

Public selection, shaping, projection, argument handling, HTTP cache behavior, rendering, and error semantics belong in the functional specification and corresponding automated tests, not in this document.

Architecture documentation should change only when technical boundaries, runtime integration, build structure, or distribution invariants change.
