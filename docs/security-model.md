# ImportJSON — Security Model

This document explains the security boundaries, threats, and security-relevant limitations of ImportJSON. It is intentionally an architectural overview rather than a second copy of the product specification, implementation, CI configuration, or release runbook.

Exact observable behavior belongs in the [Functional Specification](functional-specification.md). Runtime integration details belong in [Architecture](architecture.md). Practical usage guidance belongs in the [User Guide](user-guide.md). Vulnerability reporting belongs in [`SECURITY.md`](../SECURITY.md).

## 1. Scope and non-goals

ImportJSON accepts a user-supplied HTTP or HTTPS URL, optionally attaches one caller-supplied HTTP `Authorization` value, retrieves a JSON document through Google Apps Script, transforms untrusted JSON, and returns a matrix to Google Sheets.

The security model covers:

- untrusted remote URLs, responses, and JSON structures;
- direct transmission of an HTTP `Authorization` header value;
- confidentiality implications of HTTP response caching;
- bounded resource consumption while parsing and transforming input;
- error and output behavior at the Sheets boundary;
- dependency and release integrity at a project level.

ImportJSON is not an OAuth client, token-refresh service, credential store, secret manager, authorization system, network proxy, or data-loss-prevention system. It does not provide arbitrary request headers.

## 2. Trust boundaries

The main data path is:

```text
Google Sheet / formula
        ↓
Apps Script project or published Library
        ↓
Library-owned or project-local Script Cache
        ↓
UrlFetchApp
        ↓
remote HTTPS origin
        ↓
untrusted response body
        ↓
JSON parsing / selection / shaping / projection
        ↓
Google Sheets result matrix
```

Anonymous requests may also use plain HTTP as defined by the Functional Specification. Authenticated requests require HTTPS.

The important boundaries are:

- **Sheet → ImportJSON:** formula arguments, including an optional Authorization value, are user-controlled input and are validated before use.
- **ImportJSON → remote origin:** the origin is external. Its status, headers, body, and JSON structure are untrusted. An Authorization value is sent only on the direct authenticated request and automatic redirects are disabled for that request.
- **Remote body → transformation core:** successful HTTP transport does not imply valid or safe-to-process JSON; parsing and product limits still apply.
- **Library → shared cache:** Library mode and manual installation have different Script Cache scopes, which affects confidentiality assumptions for cacheable responses.
- **Repository → release:** source changes, dependencies, automated validation, generated artifacts, Apps Script publication, and GitHub release publication form a software-supply-chain boundary.

## 3. Security properties

### Network and untrusted input

Network acquisition, accepted status codes, redirect handling, JSON validation, and resource limits are part of the public contract defined by the [Functional Specification](functional-specification.md).

A successful transport response remains untrusted data. ImportJSON validates and transforms that data before it becomes a successful spreadsheet result. Anonymous plain HTTP requests receive no confidentiality or integrity protection from ImportJSON; authenticated requests require HTTPS.

### Authorization values and credential exposure

The optional `authorization` argument is the complete HTTP `Authorization` header value. ImportJSON does not parse the authentication scheme, obtain tokens, refresh credentials, or persist the value outside normal formula evaluation and request-cache identity hashing.

A credential placed in a spreadsheet cell or formula is not made secret by ImportJSON. Anyone with sufficient access to inspect that spreadsheet or its Apps Script project may be able to see the value. ImportJSON's public errors do not intentionally echo the Authorization value or remote response bodies.

### Cache confidentiality

ImportJSON caches eligible raw HTTP response bodies as a best-effort optimization. Cache identity separates anonymous requests and distinct Authorization values, while cache keys use SHA-256 digests rather than raw URL or credential text.

Hashing the key does not make a URL, formula, credential, or response confidential and is not a secret-storage mechanism.

Cache scope depends on installation mode:

- **Apps Script Library:** Script Cache belongs to the Library and may be reused by different consuming scripts;
- **manual installation:** Script Cache belongs to the spreadsheet's bound Apps Script project.

The exact cache identity, eligibility, and freshness rules belong in the [Functional Specification](functional-specification.md#3-url-http-acquisition-authorization-and-cache). Practical guidance for credentials and sensitive URLs belongs in the [User Guide](user-guide.md#authentication-and-credentials).

### Resource and availability controls

ImportJSON applies explicit product limits to bound work before relying entirely on Google Apps Script or Google Sheets platform limits. The exact current values are defined in the [Functional Specification](functional-specification.md#15-resource-and-platform-limits) and in the implementation.

These controls reduce unbounded work but do not eliminate platform quotas, execution limits, memory pressure, cache eviction, or spreadsheet spill failures.

### Error and output boundary

Public adapter failures use stable ImportJSON error codes and readable messages. Native stack traces, caller-supplied Authorization values, and remote response bodies are not part of the normal public error surface.

This reduces accidental disclosure from failed requests. It is not a sanitization layer for valid remote data: values selected from a successful JSON document are intentionally returned to the spreadsheet according to the public projection and rendering rules.

### JSONPath and dependency execution

JSONPath and regular-expression evaluation operate on untrusted JSON. The runtime integration and its qualification boundary are documented in [Architecture](architecture.md#3-jsonpath-runtime-integration), with executable tests acting as the detailed source of truth.

Dependency versions, build mechanics, CI actions, and repository settings are implementation and operational details. Security depends on those controls being maintained, but this document intentionally does not duplicate their current configuration. See the repository lockfile, workflows, tests, and maintainer documentation for the exact mechanisms in use.

### Release integrity

A release should identify the promoted source revision and the generated artifacts that users install. The repository's release process is designed so tested build outputs, Apps Script publication, and GitHub release artifacts correspond to the same promoted source revision.

The exact workflows, credentials configuration, retry mechanics, and artifact set belong in the executable release workflows and [maintainer release documentation](releasing.md), not in this threat model.

## 4. Operational guidance

Credential handling, sensitive-URL guidance, and cache choices for users are maintained in the [User Guide](user-guide.md#authentication-and-credentials). Suspected vulnerabilities must follow the private reporting process in [`SECURITY.md`](../SECURITY.md).

## 5. Known limitations

The current security model intentionally includes these limitations:

- anonymous `http:` URLs are accepted, so transport protection depends on the selected scheme;
- credentials placed in a spreadsheet formula or cell are outside ImportJSON's secret-protection boundary;
- Library-mode Script Cache is shared across consuming scripts, subject to the cache identity and HTTP caching rules in the Functional Specification;
- product resource limits reduce unbounded work but do not eliminate Google platform limits or quotas;
- successful remote JSON remains origin-controlled data and can contain sensitive, malicious-looking, or misleading values;
- repository and hosting-platform controls include administrative configuration outside the source files themselves.

These limitations should be revisited when changes alter authentication, credential handling, request capabilities, persistence, redirect behavior, execution environments, or other trust boundaries.

## 6. Security changes and vulnerability reporting

A change that alters a trust boundary, cache scope or identity, sensitive-data handling, resource bound, dependency execution model, release-integrity invariant, or public error exposure should update this document when the overall security model changes.

Do not duplicate exact product behavior here when another document owns it. Update the Functional Specification, Architecture, tests, workflows, or maintainer documentation as appropriate and link to that source of truth.

Suspected vulnerabilities should not be reported through a public issue or pull request. Follow [`SECURITY.md`](../SECURITY.md) for the private reporting process and supported security-fix scope.
