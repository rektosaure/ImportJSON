## Summary

Describe the problem and the smallest coherent change that solves it.

## Branch policy

Ordinary development pull requests target `dev` and are squash-merged after an explicit maintainer decision. Generated `sync/main-*` pull requests into `dev` use **Create a merge commit**. Pull requests into `main` are reserved for generated `release/vX.Y.Z` candidates and exceptional repository automation such as Dependabot. Do not enable auto-merge.

## Validation

- [ ] `npm test`
- [ ] Public behavior changes are covered by tests and update `docs/functional-specification.md`.
- [ ] Architecture or release invariant changes update the relevant documentation.

## History

The pull request title uses Conventional Commit format.
