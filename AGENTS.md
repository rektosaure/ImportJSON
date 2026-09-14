# AGENTS.md

## Design

Keep the system explainable in a few minutes.

Preserve the product semantics defined in `docs/functional-specification.md` and the architectural boundaries documented in `docs/architecture.md`.

Prefer obvious, direct code and the simplest design that satisfies the specification while keeping responsibilities explicit.

Add dependencies, infrastructure, compatibility paths, abstractions, extension points, or framework machinery only for a concrete current need or a documented invariant they directly protect.

New abstractions or infrastructure need a current consumer or documented invariant. Do not introduce one-use interfaces, factories, registries, or adapters without that justification.

Do not let implementation convenience silently decide an unresolved question. Decisions documented as unresolved must be resolved explicitly before becoming product behavior.

## Changes

Make the smallest coherent change required by the task.

Keep changes scoped to the requested task. Do not mix in speculative cleanup, compatibility work, future infrastructure, unrelated refactors, renaming, or dependency upgrades.

Refactor only when it is necessary to make the requested change coherent or to protect a documented invariant.

Do not commit or push changes directly; use a dedicated branch and pull request.

Pull request titles MUST use Conventional Commit format. The release workflow derives SemVer changes from squash-merged commit history, so use `feat:` for user-visible features, `fix:` for bug fixes, and `!` or a `BREAKING CHANGE:` footer for breaking changes. Use non-release types such as `docs:`, `test:`, `build:`, `ci:`, or `chore:` when no product version bump is intended.

Keep contributor-facing workflow guidance in `CONTRIBUTING.md` aligned with these rules.

Do not treat existing implementation behavior as authoritative when it conflicts with the specification.

When intentionally changing public behavior, update the specification and tests in the same change.

## Validation

Use the repository's committed tooling and CI configuration as the source of truth for build, test, lint, format, and other validation commands.

Do not invent commands or claim checks were run when they were not.

Add or update tests for changed observable behavior and regressions.

Report any validation that could not be performed.

## Documentation

Keep durable product semantics in the functional specification.

Keep implementation rationale in focused documentation only when it is genuinely useful for future maintainers.

Do not grow this file into a second specification.
