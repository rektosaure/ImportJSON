# ImportJSON — Architecture

This document defines technical boundaries and invariants that support the [Functional Specification](functional-specification.md). If the two documents conflict, the functional specification is authoritative.

## 1. Boundaries

The product flow is:

```text
HTTP/HTTPS URL
    ↓
HTTP acquisition
    ↓
JSON parsing
    ↓
JSONPath selection
    ↓
record shaping
    ↓
projection / tabularization
    ↓
Google Sheets rendering
```

The public v1 surface is one Google Sheets function, `IMPORTJSON`.

The implementation is divided into a reusable core and a Google Apps Script adapter.

### Core

`src/core.mjs` owns behavior that is independent of Google Sheets:

- JSON parsing;
- JSONPath selection;
- JSON Pointer resolution;
- pointer shaping and `columnar` shaping;
- automatic and explicit projection;
- nested-object flattening;
- deterministic structured-value serialization.

The core MUST remain testable in standard JavaScript and MUST NOT depend directly on `UrlFetchApp`, `SpreadsheetApp`, `CacheService`, or `PropertiesService`.

### Apps Script adapter

`src/apps-script.mjs` owns the Google Apps Script boundary:

- normalization of Sheets argument shapes;
- URL validation;
- one bounded HTTP GET;
- translation of the core table into a Sheets matrix;
- blank rendering for internal missing values and JSON `null`.

The adapter MUST NOT duplicate core selection, shaping, or projection rules.

## 2. JSONPath engine

ImportJSON uses `json-p3@2.3.0` with the source patch in [`src/json-p3-patch.mjs`](../src/json-p3-patch.mjs) and `re2js@2.8.6` for RFC 9535 `match()` and `search()` behavior.

The qualified engine MUST continue to:

- pass the pinned RFC 9535 compliance suite;
- run in Google Apps Script V8 after bundling;
- avoid Node.js runtime dependencies that are unavailable in Apps Script;
- avoid `eval`, `new Function`, and dynamic code generation for query evaluation;
- preserve the order and multiplicity required by the functional specification;
- support deterministic object-member traversal through the environment `entries` hook.

The patch also makes relevant selection paths lazy and exposes visit/deadline hooks used by qualification probes. These hooks are engine-level capabilities; the public v1 contract does not claim ImportJSON-specific size, depth, row, column, or execution-budget error codes that are not implemented by the product core.

Any update or replacement of the JSONPath engine MUST repeat the qualification described in [`jsonpath-qualification.md`](jsonpath-qualification.md).

## 3. Determinism

Determinism is a product invariant, not an implementation convenience.

The implementation MUST preserve:

- JSONPath result order and multiplicity;
- Unicode code-point ordering where ImportJSON supplies otherwise unspecified object-member order;
- explicit `columns` order;
- target-array order during pointer shaping;
- index order during `columnar` shaping;
- recursive Unicode code-point ordering of object keys during structured-value serialization.

No layer may introduce a global sort of logical rows.

## 4. Shaping boundary

Shaping occurs after JSONPath selection and before projection.

The core supports exactly one shaping operation per invocation:

- no shaping;
- expansion of one array identified by JSON Pointer;
- `columnar` conversion of direct parallel arrays.

Projection MUST see the logical rows produced by shaping. This ordering allows explicit pointers such as `/items/value` to refer to the shaped representation.

The implementation MUST NOT recursively expand arrays or create an implicit Cartesian product.

## 5. HTTP boundary

The Apps Script adapter:

- uses GET;
- follows redirects;
- accepts final `2xx` statuses only;
- maps fetch failures and final non-`2xx` statuses to `HTTP_ERROR`;
- uses a 20-second HTTP timeout;
- retrieves the source document once per invocation;
- does not expose remote response bodies or native fetch exceptions through normal public error messages.

A successful response body is passed to the core as text and parsed there.

## 6. Sheets rendering boundary

The renderer converts the core table to the matrix returned by the custom function.

It MUST:

- put headers in the first row when headers exist;
- map internal `undefined` and JSON `null` to empty cells;
- return a single blank cell when the core has no known automatic schema;
- leave spill conflicts to Google Sheets.

The custom function returns a matrix; it MUST NOT write directly to arbitrary spreadsheet cells.

## 7. Build and distribution

The production build has one responsibility: create the autonomous Apps Script Library bundle.

`npm run build` produces:

- `build/importjson-library.gs`;
- `build/appsscript.json`;
- runtime dependency license files.

The `build/` directory is generated and is not the user-facing installation artifact.

`dist/ImportJSON.gs` is the small, versioned wrapper copied into the consuming Apps Script project. It exposes `IMPORTJSON(...)` with JSDoc and delegates to the Apps Script Library through the identifier `ImportJSONLib`.

The consuming Apps Script project therefore contains the wrapper and a pinned published ImportJSON Library version. The large generated bundle MUST NOT be copied into `dist/`.

## 8. Change discipline

Observable behavior belongs in the functional specification and corresponding tests. Architecture documentation SHOULD describe boundaries and invariants rather than duplicate the full behavioral contract.

A change that modifies selection, shaping, projection, rendering, argument handling, or public errors MUST update the functional specification and automated tests in the same change.
