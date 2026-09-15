# ImportJSON — Validation

This document defines the minimum release validation for public v1. The [Functional Specification](functional-specification.md) defines observable behavior and [`architecture.md`](architecture.md) defines technical invariants.

Use the repository build and test commands:

```sh
npm ci
npm test
```

`npm test` builds the production Apps Script Library bundle and runs the automated test suite.

## Core behavior

Automated tests MUST cover:

- valid and invalid JSON parsing;
- omitted `query` on array and non-array roots;
- explicit `$` on an array root as distinct from omitted `query`;
- argument errors for invalid query forms and `INVALID_JSONPATH` for invalid syntax;
- RFC 9535 selection behavior, including order, multiplicity, and empty selections;
- automatic and explicit projection;
- nested-object flattening and schema union;
- Unicode code-point ordering of automatic headers;
- empty objects in automatic projection and `{}` under explicit projection;
- `@value` for non-object records;
- internal distinction between missing and `null`;
- deterministic serialization of structured values;
- `HETEROGENEOUS_RECORDS` for unshaped mixed object/non-object records;
- pointer shaping of scalar, object, structured, and heterogeneous array elements;
- missing, `null`, empty, and invalid pointer-shape targets;
- explicit projection after pointer shaping;
- no second array expansion and no implicit Cartesian product;
- `columnar` alignment of direct arrays by index;
- repetition of direct non-array properties in `columnar`;
- object elements inside columnar arrays followed by normal flattening;
- empty parallel arrays;
- multiple selected columnar records in selection order;
- `INVALID_COLUMNAR_TARGET` for non-object records or objects without direct arrays;
- `COLUMN_LENGTH_MISMATCH` for unequal sibling direct-array lengths;
- preservation of strings without implicit trimming or date conversion.

## Google Sheets adapter

Automated adapter tests MUST demonstrate:

- one bounded GET per invocation;
- a 20-second fetch timeout setting;
- literal and single-cell `url` values;
- rejection of multi-cell URL ranges and unsupported URL schemes;
- literal and single-cell `query` values;
- one JSON Pointer string or a one-dimensional range for `columns`;
- rejection of two-dimensional column ranges and blank column pointers;
- `shape` as `columnar` or one JSON Pointer;
- blank positional placeholders when later optional arguments are supplied;
- `refreshKey` having no effect on core data semantics;
- network and final non-`2xx` failures mapped to `HTTP_ERROR` without exposing remote bodies or native error details;
- successful HTTP responses with invalid JSON mapped to `INVALID_JSON`;
- `null` and missing values rendered as empty Sheets cells;
- a single blank cell when automatic schema is unknown;
- pointer shaping and columnar shaping through the public adapter.

## Public error contract

Tests and documentation MUST agree on the implemented public codes:

```text
INVALID_ARGUMENT
INVALID_URL
HTTP_ERROR
INVALID_JSON
INVALID_JSONPATH
HETEROGENEOUS_RECORDS
INVALID_EXPANSION_TARGET
INVALID_COLUMNAR_TARGET
COLUMN_LENGTH_MISMATCH
```

Do not publish additional ImportJSON-specific error codes unless they are implemented and covered by acceptance tests.

Platform execution, cell, and spill limits may still fail an invocation. Those failures are outside the ImportJSON-specific error-code contract unless explicitly mapped by the product.

## JSONPath qualification

The JSONPath engine MUST satisfy [`jsonpath-qualification.md`](jsonpath-qualification.md), including:

- the pinned CTS checksum and **704/704** compliance cases;
- deterministic ordering, duplicates, and reverse slices;
- RE2JS-backed `match()` and `search()`;
- Apps Script `TextEncoder` compatibility;
- Apps Script-like execution without unavailable Node.js globals;
- the real Apps Script adapter bundle.

## Live Google Sheets smoke

Before a public release, the exact candidate production bundle and wrapper MUST pass [`smoke-tests.md`](smoke-tests.md) in Google Apps Script V8 and a real Google Sheet.

The smoke result MUST identify the tested commit revision or candidate bundle checksum. Coverage includes `columnar`, non-array root semantics, explicit `$`, literal pointer projection, null/missing rendering, deterministic structured-value serialization, `HTTP_ERROR`, and `INVALID_JSON`.

After publication, the same matrix MUST pass against the immutable Apps Script Library version associated with the release.

## Distribution

Release validation MUST verify that `dist/ImportJSON.gs`:

- exposes `IMPORTJSON(url, query, columns, shape, refreshKey)`;
- includes `@customfunction` JSDoc;
- delegates to `ImportJSONLib.IMPORTJSON(...)`;
- remains a small wrapper rather than embedding the JSONPath engine or production bundle.

The candidate and immutable Library versions MUST be tested with the wrapper through the live Google Sheets smoke suite.

## Documentation acceptance

Before release, verify that:

- `README.md` remains a focused landing page;
- `docs/user-guide.md` covers all public arguments, shaping modes, projection rules, ordering, rendering, errors, and platform-limit behavior;
- all maintained documentation is in English;
- examples are generic and provider-independent except where a real endpoint is required for installation testing;
- the only documented public signature is `IMPORTJSON(url, [query], [columns], [shape], [refreshKey])`;
- `columnar` is described as a generic object-of-arrays transformation;
- documentation describes the current product only;
- public error lists contain only codes implemented by the current product.
