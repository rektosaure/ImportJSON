# Releasing

ImportJSON releases are published manually from the current `main` commit through one GitHub Actions workflow: **Publish release**.

Normal development remains unchanged: work on a branch, open a pull request, and squash-merge it into `main`. Pull request titles use Conventional Commit format. CI builds and tests every `main` commit and uploads the exact release candidate as the `importjson-release-candidate` artifact.

When a product release is wanted, open **Actions → Publish release**, select `main`, and run the workflow. No version number, tag, GitHub Release, or Apps Script version is entered manually.

## One-time repository setup

The publish workflow requires two GitHub Actions values:

- repository variable `APPS_SCRIPT_ID`: the Script ID of the standalone Apps Script project used as the ImportJSON Library;
- repository secret `CLASPRC_JSON`: the complete contents of `~/.clasprc.json` produced by `clasp login` for a Google account that can edit that Apps Script project.

The target Apps Script project must already exist, be configured and shared as the production Library, and have the Apps Script API enabled for the publishing account.

Treat `CLASPRC_JSON` as a password. Never commit `.clasprc.json` or `.clasp.json`; both are ignored by Git.

## Publish flow

The workflow publishes exactly the current `main` commit. It:

1. locks the release SHA to the current HEAD of `main` and aborts if `main` moves;
2. finds the successful `CI` push run for that exact SHA;
3. downloads that run's `importjson-release-candidate` artifact instead of rebuilding;
4. derives the product version from immutable SemVer tags and Conventional Commit history;
5. prepares the exact validated Apps Script bundle and manifest for publication;
6. rechecks that `main` still points at the locked release SHA immediately before Apps Script publication;
7. pushes the validated Apps Script files and creates one immutable Apps Script version;
8. generates `SHA256SUMS` and `release-manifest.json`;
9. creates the `vX.Y.Z` tag and GitHub Release, or repairs the same release on a retry;
10. uploads the validated bundle, Apps Script manifest, user-facing wrapper, dependency licenses, and release metadata to the GitHub Release.

The GitHub Release is created only after Apps Script publication succeeds. A failed Google publication therefore does not create a product release.

The workflow uses `@google/clasp` at an exact pinned version. Third-party GitHub Actions are referenced by immutable commit SHA rather than floating tags.

## Version calculation

The first public release is always `v1.0.0`. It does not depend on historical pre-publication commit messages.

After `v1.0.0`, squash-merged pull request titles drive SemVer changes and must use Conventional Commit format.

- `fix:` requests a patch release;
- `feat:` requests a minor release;
- `!` in the Conventional Commit header or a `BREAKING CHANGE:` footer requests a major release;
- `docs:`, `test:`, `build:`, `ci:`, and `chore:` do not request a product release.

If several releasable commits exist, the strongest required bump wins.

If there is no releasable commit since the previous tag, **Publish release** fails instead of creating an empty version.

`package.json` remains a private build package and is not the product-version source of truth. Product versions are the immutable Git tags.

## Release candidate

CI stages the exact release candidate with these files:

```text
importjson-library.gs
appsscript.json
ImportJSON.gs
json-p3-LICENSE
re2js-LICENSE
```

`ImportJSON.gs` is the small user-facing Google Sheets wrapper. It is part of the release identity even though the standalone Apps Script Library publication uses only `importjson-library.gs` and `appsscript.json`.

The publish workflow promotes these exact CI-produced files. It does not rebuild them.

## Release identity

Product and Apps Script versions are intentionally different identifiers. For example:

```text
GitHub release:       v1.2.0
Git commit:           0123456789abcdef...
Apps Script version:  17
Bundle SHA-256:       9fa8...
```

`release-manifest.json` records the SemVer release, exact Git commit, CI run, Apps Script project/version, pinned publishing tool version, and hashes of the deployed Apps Script files plus the user-facing wrapper.

`SHA256SUMS` records hashes for every file copied from the validated CI release candidate.

Do not encode the Apps Script integer into product SemVer and do not maintain a second handwritten version table.

## Idempotence and recovery

The Apps Script version description contains the product tag and release Git SHA. Before creating a version, the workflow checks whether that exact description already exists and reuses it on a retry.

If the SemVer tag already points at the current `main` commit, the version calculator enters retry mode instead of incrementing the version again. If the GitHub Release already exists, its assets are replaced in place.

This makes a rerun safe after a partial failure without consuming another product version or Apps Script version.

## Artifact availability

Publication depends on the `importjson-release-candidate` artifact from the successful CI run for the current `main` commit. Publish while that artifact is still retained by GitHub Actions. If it has expired, rerun that exact CI commit before publishing; the publish workflow never silently rebuilds different bytes.

## Version budget

Apps Script projects have a finite version history. ImportJSON therefore creates Apps Script versions only when **Publish release** is explicitly run, never for pull requests or ordinary `main` commits.
