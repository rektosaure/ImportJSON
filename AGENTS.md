# AGENTS.md

Follow [`CONTRIBUTING.md`](CONTRIBUTING.md) for repository workflow, validation, documentation ownership, and pull request conventions.

## Agent-specific rules

Keep the system explainable in a few minutes. Prefer the smallest direct change that satisfies the current requirement and preserves the public contract in [`docs/functional-specification.md`](docs/functional-specification.md) and the boundaries in [`docs/architecture.md`](docs/architecture.md).

Do not introduce speculative abstractions, compatibility paths, dependencies, infrastructure, or unrelated cleanup. New machinery needs a concrete current consumer or a documented invariant that it directly protects.

Do not let implementation convenience decide an unresolved product question. When implementation and specification conflict, the specification is authoritative.

When intentionally changing observable behavior, update the functional specification and tests in the same change.

Use only the repository's committed validation commands. Never claim a check was run when it was not, and report validation that could not be performed.
