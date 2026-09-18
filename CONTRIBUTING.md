# Contributing

ImportJSON is a small, specification-driven project. Keep changes focused and preserve the public contract in [`docs/functional-specification.md`](docs/functional-specification.md).

## Workflow

`dev` is the protected development integration branch. Normal development starts from `dev` and returns to `dev`; `main` is the protected release branch.

1. Create a focused branch from `dev`.
2. Make the smallest coherent change required.
3. Run the repository validation commands.
4. Update tests and the document that owns any changed behavior or invariant.
5. Open a pull request into `dev` with a Conventional Commit title.
6. After CI is green, a maintainer explicitly authorizes and squash-merges the pull request.

Do not push directly to `dev` or `main`, force-push either protected branch, or enable automatic merging. Ordinary development pull requests into `dev` use squash merge. Generated synchronization pull requests from `sync/main-*` into `dev` use **Create a merge commit** so independent `main` changes remain represented by their original commits. Generated release pull requests into `main` also use **Create a merge commit**.

Typical pull request titles:

```text
feat: add a user-visible capability
fix(core): preserve deterministic ordering
docs: clarify installation
test: cover a regression
feat!: replace a public API contract
```

Release candidates are frozen from `dev` by the **Prepare release** workflow and reach `main` only through the generated release pull request. Release versioning, promotion, synchronization, and publication are documented in [`docs/releasing.md`](docs/releasing.md).

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

- [`README.md`](README.md): product introduction, release installation, quick start, and user-documentation navigation;
- [`docs/user-guide.md`](docs/user-guide.md): practical usage, examples, troubleshooting, and security guidance users need while operating the product;
- [`docs/functional-specification.md`](docs/functional-specification.md): normative observable behavior and exact public limits/errors;
- [`docs/architecture.md`](docs/architecture.md): technical boundaries and runtime integration;
- [`docs/security-model.md`](docs/security-model.md): threat model, trust boundaries, security properties, and known limitations;
- [`SECURITY.md`](SECURITY.md): supported security-fix scope and vulnerability reporting;
- [`docs/releasing.md`](docs/releasing.md) and [`docs/smoke-tests.md`](docs/smoke-tests.md): maintainer publication procedure and real-runtime release checks;
- [`AGENTS.md`](AGENTS.md): instructions specific to coding agents.

The README and User Guide may summarize behavior for usability, but they should link to the Functional Specification rather than duplicate exhaustive normative tables or edge-case rules. Architecture and security documents should describe boundaries and invariants, not copy current workflow syntax, dependency versions, repository settings, or test checklists whose executable source already exists.

Documentation on `dev` describes the current development state and may include unreleased behavior. `main` is the promoted release source. Tagged releases freeze the documentation for exact published versions. Keep that distinction visible in user-facing installation guidance, and do not imply that development-only behavior already exists in the latest published release.

If public behavior changes, update the Functional Specification and tests in the same pull request. Update architecture, security-model, or release documentation only when the corresponding invariant changes.

Keep maintained documentation in English and about the current source version. Prefer links over repeated explanations, and remove obsolete behavior instead of preserving migration prose unless compatibility is part of the public contract.

## Design

Prefer direct code over speculative abstraction, compatibility machinery, dependencies, or extension points without a concrete current requirement.
