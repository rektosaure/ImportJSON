# Contributing

ImportJSON is a small, specification-driven project. Keep changes focused and preserve the public behavior defined in [`docs/functional-specification.md`](docs/functional-specification.md).

## Development workflow

1. Create a branch from `main`.
2. Make the smallest coherent change required.
3. Run the repository validation commands.
4. Open a pull request into `main`.
5. Use a Conventional Commit title for the pull request.
6. Squash-merge only after CI is green.

Do not push changes directly to `main`.

## Pull request titles

Use Conventional Commit format so the project history remains easy to scan.

Examples:

```text
feat: add a user-visible capability
fix(core): preserve deterministic ordering
docs: clarify installation
test: cover a regression
ci: simplify release publication
feat!: replace a public API contract
```

Release versions are chosen explicitly when the **Publish release** workflow is run; pull request titles do not calculate the next version.

## Validation

Node.js 22 or newer is required.

```sh
npm ci
npm test
```

`npm test` builds the production Apps Script Library bundle and runs the full automated test suite, including the pinned RFC 9535 JSONPath qualification.

The committed tests and CI configuration are the source of truth for automated validation. Do not maintain a second prose checklist that duplicates test coverage.

If public behavior changes, update the functional specification and tests in the same pull request. If architecture or release invariants change, update the corresponding focused documentation.

## Documentation ownership

Each maintained document has one primary responsibility:

- [`README.md`](README.md) is the landing page: current installation, quick start, common operations, and pointers to deeper documentation.
- [`docs/user-guide.md`](docs/user-guide.md) is the practical user reference. It explains how to use the current product but does not override the functional specification.
- [`docs/functional-specification.md`](docs/functional-specification.md) is the normative contract for observable public behavior.
- [`docs/architecture.md`](docs/architecture.md) documents technical boundaries, runtime integration, and the rationale for specialized qualification.
- [`docs/releasing.md`](docs/releasing.md) documents publication, release identity, and release-specific checks.
- [`docs/smoke-tests.md`](docs/smoke-tests.md) contains only manual checks that require the real Google Sheets / Apps Script runtime.
- [`SECURITY.md`](SECURITY.md) documents vulnerability reporting and supported security-fix scope.
- [`AGENTS.md`](AGENTS.md) contains repository instructions specific to coding agents and delegates general workflow rules back to this guide.

Put new information in the document that owns it. Prefer links over copying the same explanation into several files. Repetition is acceptable only when the shorter copy is necessary for a reader to use that document independently, such as installation steps in the README and User Guide.

Keep maintained documentation in English and about the current product. Remove obsolete behavior rather than preserving historical migration prose in current-product documentation. Prefer provider-independent examples unless a real endpoint is required for runtime validation.

## Design constraints

Prefer direct code over speculative abstraction. Do not add compatibility paths, dependencies, frameworks, or extension points without a concrete current requirement.

The project is greenfield. Do not preserve obsolete behavior or migration machinery unless it is part of the documented public contract.
