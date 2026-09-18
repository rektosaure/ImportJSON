# AGENTS.md

Follow [`CONTRIBUTING.md`](CONTRIBUTING.md) for repository workflow, validation, documentation ownership, and pull request conventions.

## Agent-specific rules

- Prefer the smallest direct change that satisfies the current requirement and preserves the public contract and architecture boundaries.
- Do not introduce speculative abstractions, compatibility paths, dependencies, infrastructure, or unrelated cleanup. New machinery needs a concrete current consumer or a documented invariant it directly protects.
- Do not merge pull requests, enable auto-merge, or push directly to protected `dev` or `main` unless the user explicitly instructs that specific action in the current task.
- Do not modify generated `release/vX.Y.Z` candidate branches.
- Report only validation actually performed, including any checks that could not be run.
