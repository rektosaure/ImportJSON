# Releasing

This is maintainer documentation for promoting and publishing ImportJSON releases. The executable sources of truth are [`.github/workflows/prepare-release.yml`](../.github/workflows/prepare-release.yml), [`.github/workflows/release.yml`](../.github/workflows/release.yml), and [`.github/workflows/sync-dev.yml`](../.github/workflows/sync-dev.yml); this document records the human decisions, invariants, and recovery rules that should not be inferred from workflow syntax alone.

Development accumulates on protected `dev`. A release freezes one exact `dev` revision in `release/vX.Y.Z`, validates it through a pull request into protected `main`, and publishes only after that pull request is manually merged.

## Repository setup

General development workflow, protected-branch rules, validation commands, and normal pull-request conventions are owned by [`CONTRIBUTING.md`](../CONTRIBUTING.md).

Release automation additionally requires:

- GitHub Actions permission for `GITHUB_TOKEN` to create pull requests;
- merge commits to remain enabled because generated `sync/main-*` and release pull requests use **Create a merge commit**;
- automatic merge to remain disabled;
- `main` to remain the default release branch and `dev` the development integration branch.

Every push to `main` starts **Synchronize dev**. The workflow checks whether merging current `main` into current `dev` would change repository content. A normal release promotion usually introduces no new content into `dev`, so no synchronization pull request is needed. If an exceptional `main` update such as Dependabot introduces content absent from `dev`, the workflow creates a frozen `sync/main-*` branch and opens a pull request into `dev`; it never merges or pushes directly into `dev`.

The publication workflow requires a production Apps Script Library project and GitHub Actions configuration that lets the publisher update that project. The exact variable and secret names consumed by the workflow are defined in `release.yml` and should not be duplicated here.

The publishing Google account must be able to edit the target Apps Script project and use the Apps Script API.

Treat local or CI `clasp` credentials as secrets. Never commit `.clasprc.json` or `.clasp.json`; both are ignored by Git.

## Choose the version

Use normal SemVer and enter the version without the `v` prefix when preparing a release, for example `1.5.0`. The resulting branch is `release/v1.5.0` and the published tag is `v1.5.0`.

Choose the bump from the public product change:

- patch for compatible bug fixes;
- minor for compatible user-visible capabilities;
- major for breaking public-contract changes.

Git tags are the product-version source of truth. `package.json` is a private build package and is not the product version.

Documentation on a release tag is the documentation for that release. Before promotion, make sure user-facing documentation and the Functional Specification on the frozen candidate describe the behavior being released rather than a future change.

## Keep dev synchronized with main

A release may be prepared only when current `main` contributes no repository-content change when merged into current `dev`. This is deliberately a content invariant rather than a strict ancestry requirement: a release merge commit on `main` may not itself be present in `dev`, even though its released content already came from `dev`.

When **Synchronize dev** opens a `sync/main-*` pull request, approve its workflow runs, review the diff, and merge it manually with **Create a merge commit**. Do not squash that synchronization pull request: preserving the original `main` commits avoids duplicating the same change under a second commit in later release notes.

If the synchronization merge conflicts, the workflow fails instead of modifying `dev`. Resolve the integration on a normal branch, open a pull request into `dev`, and preserve the relevant `main` lineage with a merge commit before preparing another release.

## First release bootstrap

The first published release is a one-time exception because a repository may already have its initial source promoted to `main` before the release workflow is introduced.

If no GitHub release and no version tag matching `v*` exists yet, open **Actions → Publish release**, keep the workflow source on `main`, enter the initial SemVer version, and run it manually. The workflow validates and builds the exact current `main` commit, publishes the Apps Script version, and creates the matching GitHub Release.

This bootstrap path is deliberately self-disabling: once any GitHub release or `v*` tag exists, manual publication through `workflow_dispatch` is refused. All later releases must use the normal frozen `dev` candidate and release pull-request flow below.

## Prepare

Open **Actions → Prepare release**, keep the workflow source on `main`, enter the version, and run it.

Preparation validates the current `dev` revision, verifies that current `main` would add no content when merged into it, freezes that exact revision in `release/vX.Y.Z`, and opens a pull request into `main`. If current `main` still contributes changes, preparation refuses to continue until the synchronization pull request has been merged.

Pull requests created by the repository `GITHUB_TOKEN` require manual approval before their `pull_request` workflows run. Review the generated release pull request, choose **Approve workflows to run**, and wait for the required checks to pass.

`dev` may continue moving after preparation. The release candidate does not move with it.

## Authorize publication

Review the release pull request as the complete release candidate. Merge it manually with **Create a merge commit**.

Merging that pull request is the human authorization to publish. The merge event automatically starts **Publish release** for the version encoded in the `release/vX.Y.Z` branch name. The resulting push to `main` also starts **Synchronize dev**, which normally determines that no content synchronization is needed for the release itself.

Do not squash-merge or rebase-merge a release pull request. Publication verifies that the frozen release-candidate commit is an ancestor of the promoted `main` commit and refuses a non-merge promotion.

## Publish

The publication workflow validates and builds the exact promoted `main` commit, publishes the corresponding Apps Script version, and creates the matching immutable GitHub Release from those tested outputs.

Synchronization is deliberately independent of publication and never authorizes or performs a merge into `dev`. A later direct `main` change may cause **Synchronize dev** to open a separate pull request; that pull request can be reviewed and merged on its own schedule, but **Prepare release** will refuse another candidate while `main` still contributes content absent from `dev`.

Do not reproduce workflow mechanics step-by-step in prose. If mechanics change, update the workflows; update this document only when the operator procedure or release invariant changes.

## Release notes

Release notes are generated from non-merge commits since the previous published release. Conventional Commit titles from the development pull requests are used to organize the digest, while GitHub's generated notes remain supplemental.

Pull request titles should therefore describe user-visible changes clearly when there is one. Version selection remains a human decision and is not derived automatically from commit categories.

## Release assets

A published release contains:

```text
importjson-library.gs
ImportJSON.gs
THIRD_PARTY_LICENSES.txt
release-manifest.json
```

- `importjson-library.gs` is the complete bundle used for manual installation and Apps Script Library publication.
- `ImportJSON.gs` is the wrapper used with the Apps Script Library installation.
- `THIRD_PARTY_LICENSES.txt` contains bundled dependency notices.
- `release-manifest.json` identifies the source revision, Apps Script Library version, and hashes of installable release artifacts.

The internal Apps Script project manifest used during publication is a build input, not a public release asset.

Do not encode the Apps Script integer version into product SemVer and do not maintain a second handwritten version table.

## Validation

Preparation runs the repository audit and automated test suite against the frozen `dev` candidate. The release pull request then passes the checks required by `main`. Publication runs `npm test` again against the exact promoted commit.

Tests own the detailed automated behavior checks; do not maintain a parallel prose checklist here.

After publication, run the [live Google Sheets smoke tests](smoke-tests.md) against both supported installation modes. These checks cover behavior that requires the real Google Sheets / Apps Script runtime and cannot be fully established by the Node.js suite.

Record the release tag, exact Git commit, and Apps Script Library version with the smoke-test result.

If a published release fails a real-runtime smoke test, fix the problem through the normal `dev` pull-request workflow and publish a new version. Do not rewrite a release that users may already have consumed.

## Retry and recovery

A failed publication run should be retried from the same GitHub Actions run so it retains the original release pull request, version, and promoted commit.

The publication workflow is designed to retry the same release identity after a partial infrastructure failure without intentionally creating a different product release. A retry is valid only when it still refers to the same product version and source commit. If an existing tag, Apps Script version, draft release, or published release conflicts with that identity, investigate rather than forcing publication through the mismatch.

If preparation fails before the release pull request is created, fix `dev` and run **Prepare release** again. If a frozen `release/vX.Y.Z` branch already exists at a different commit, resolve that candidate explicitly rather than silently moving it.

If **Synchronize dev** reports content absent from `dev`, merge the generated synchronization pull request manually before the next release. If it fails because of a conflict or concurrent branch movement, resolve that integration through a pull request rather than pushing directly to `dev`. The release or other `main` change remains valid; only the next release preparation is blocked until the content invariant is restored.

Published GitHub releases are treated as write-once by the project workflow. Correct a published release through a new version instead of mutating its contract or artifacts.

## Apps Script version budget

Apps Script projects have a finite version history. ImportJSON creates Apps Script versions only after a release pull request has been manually promoted to `main`, never for development pull requests or ordinary `dev` commits.
