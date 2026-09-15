# Contributing

ImportJSON is a small, specification-driven project. Keep changes focused and preserve the public contract in [`docs/functional-specification.md`](docs/functional-specification.md).

## Workflow

1. Create a branch from `main`.
2. Make the smallest coherent change required.
3. Run the repository validation commands.
4. Update tests and the document that owns any changed behavior or invariant.
5. Open a pull request into `main` with a Conventional Commit title.
6. Squash-merge only after CI is green.

Do not push directly to `main`.

Typical pull request titles:

```text
feat: add a user-visible capability
fix(core): preserve deterministic ordering
docs: clarify installation
test: cover a regression
feat!: replace a public API contract
```

Release versioning and publication are documented in [`docs/releasing.md`](docs/releasing.md).

## Validation

Node.js 22 or newer is required.

```sh
npm ci
npm test
```

`npm test` builds the production Apps Script Library bundle and runs the full automated suite, including JSONPath qualification.

Tests and CI are the source of truth for automated validation. Do not maintain a second prose checklist that duplicates them.

## Documentation ownership

Put information in the document that owns it:

- [`README.md`](README.md): installation, quick start, and navigation;
- [`docs/user-guide.md`](docs/user-guide.md): practical product usage;
- [`docs/functional-specification.md`](docs/functional-specification.md): normative observable behavior;
- [`docs/architecture.md`](docs/architecture.md): technical boundaries and runtime integration;
- [`docs/releasing.md`](docs/releasing.md) and [`docs/smoke-tests.md`](docs/smoke-tests.md): publication and real-runtime release checks;
- [`SECURITY.md`](SECURITY.md): supported security-fix scope and vulnerability reporting;
- [`AGENTS.md`](AGENTS.md): instructions specific to coding agents.

If public behavior changes, update the functional specification and tests in the same pull request. Update architecture or release documentation only when the corresponding invariant changes.

Keep maintained documentation in English and about the current product. Prefer links over repeated explanations, and remove obsolete behavior instead of preserving migration prose unless compatibility is part of the public contract.

## Design

Prefer direct code over speculative abstraction, compatibility machinery, dependencies, or extension points without a concrete current requirement.
