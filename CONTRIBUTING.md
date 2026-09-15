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

Pull request titles are validated by CI and must use Conventional Commit format.

Examples:

```text
feat: add a user-visible capability
fix(core): preserve deterministic ordering
docs: clarify installation
test: cover a regression
ci: harden release publication
feat!: replace a public API contract
```

`feat:` requests a minor release after `v1.0.0`, `fix:` requests a patch release, and `!` or a `BREAKING CHANGE:` footer requests a major release. Non-product types such as `docs:`, `test:`, `build:`, `ci:`, and `chore:` do not request a release.

When squash-merging, keep the pull request title as the squash commit title so release semantics remain deterministic.

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

- [`README.md`](README.md) is the landing page: current installation, quick start, and pointers to deeper documentation.
- [`docs/user-guide.md`](docs/user-guide.md) is the complete practical reference for users.
- [`docs/functional-specification.md`](docs/functional-specification.md) is the normative contract for observable public behavior.
- [`docs/architecture.md`](docs/architecture.md) documents technical boundaries and implementation invariants without restating the full behavioral contract.
- [`docs/releasing.md`](docs/releasing.md) documents publication, release identity, and release-specific checks.
- [`docs/jsonpath-qualification.md`](docs/jsonpath-qualification.md) documents qualification of the RFC 9535 engine and its Apps Script compatibility layer.
- [`docs/smoke-tests.md`](docs/smoke-tests.md) contains only the manual checks that require the real Google Sheets / Apps Script runtime.

Put new information in the document that owns it. Prefer links over repeating the same rule in several places.

## Design constraints

Prefer direct code over speculative abstraction. Do not add compatibility paths, dependencies, frameworks, or extension points without a concrete current requirement.

The project is greenfield. Do not preserve obsolete behavior or migration machinery unless it is part of the documented public contract.
