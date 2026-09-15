# Releasing

ImportJSON releases are published manually from `main` through the **Publish release** GitHub Actions workflow.

The release operator supplies the product version explicitly. The workflow tests and builds the selected `main` commit, publishes that exact build to Apps Script, and creates the matching GitHub Release.

## One-time repository setup

The workflow requires two GitHub Actions values:

- repository variable `APPS_SCRIPT_ID`: the Script ID of the standalone Apps Script project used as the ImportJSON Library;
- repository secret `CLASPRC_JSON`: the complete contents of `~/.clasprc.json` produced by `clasp login` for a Google account that can edit that Apps Script project.

The target Apps Script project must exist, be configured and shared as the production Library, and have the Apps Script API enabled for the publishing account.

Treat `CLASPRC_JSON` as a password. Never commit `.clasprc.json` or `.clasp.json`; both are ignored by Git.

## Choose the version

Use normal SemVer and enter the version without the `v` prefix when running the workflow, for example `1.1.0`.

The workflow accepts the strict `X.Y.Z` form and publishes tag `vX.Y.Z`. Release versions are chosen explicitly; pull request titles and commit history do not calculate the next version.

Choose the bump from the product change being released:

- patch for compatible bug fixes;
- minor for compatible user-visible capabilities;
- major for breaking public-contract changes.

Git tags are the product-version source of truth. `package.json` remains a private build package and is not versioned with the product.

## Publish flow

Open **Actions → Publish release**, select `main`, enter the version, and run the workflow.

The workflow:

1. checks out the `main` commit selected when the run starts;
2. installs dependencies with `npm ci` from `package-lock.json`;
3. validates the requested version and refuses a same-named tag that points to another commit;
4. runs `npm test`, which builds the production Apps Script Library and executes the complete automated test suite;
5. stages the generated Library bundle, internal Apps Script manifest, consolidated third-party licenses, and `dist/ImportJSON.gs` wrapper;
6. pushes the generated Apps Script project and creates one immutable Apps Script version, unless the same release version for the same Git commit was already created by an earlier attempt;
7. generates `release-manifest.json` with the release identity and SHA-256 hashes of the published release files;
8. creates the `vX.Y.Z` GitHub Release, or repairs that same release on a retry, and uploads only the public release assets.

The selected Git commit is immutable, so publication does not depend on `main` remaining unchanged while the workflow runs.

`@google/clasp` is an exact direct development dependency installed from `package-lock.json`. Third-party GitHub Actions are referenced by immutable commit SHA.

## Release assets

A release contains:

```text
importjson-library.gs
ImportJSON.gs
THIRD_PARTY_LICENSES.txt
release-manifest.json
```

`importjson-library.gs` is the complete bundle used both for manual installation and for the published Apps Script Library. `ImportJSON.gs` is the small wrapper used only with the Apps Script Library installation. `THIRD_PARTY_LICENSES.txt` contains the license notices for bundled dependencies.

The build also generates `appsscript.json`. It is used only to publish the standalone Apps Script Library with `clasp` and is not uploaded as a GitHub Release asset.

`release-manifest.json` records:

- the SemVer release and exact Git commit;
- the Apps Script project and immutable Apps Script version;
- SHA-256 hashes for the Library bundle, user-facing wrapper, and consolidated third-party licenses;
- the installed `@google/clasp` version used to publish.

Do not encode the Apps Script integer into product SemVer and do not maintain a second handwritten version table.

## Validation

Automated release validation is `npm test` executed inside the release workflow on the exact commit being published. The tests include core behavior, Apps Script adapter behavior, distribution checks, and the pinned JSONPath qualification described in [Architecture](architecture.md).

After publication, run the manual [Google Sheets smoke tests](smoke-tests.md) for both supported installation modes. The complete runtime matrix uses the immutable Apps Script Library version and matching wrapper, and one additional sanity check verifies that `importjson-library.gs` works as a direct manual installation. These checks cover only behavior that requires the real Google Sheets / Apps Script runtime.

If a release fails its real-runtime smoke test, fix the problem through the normal branch and pull-request workflow and publish a new version. Do not mutate an already consumed product contract to hide a failed release.

## Idempotence and recovery

The Apps Script version description contains the product tag and release Git SHA. On retry, the workflow reuses an existing Apps Script version with that exact description instead of creating another one.

If the requested Git tag already points to the same release commit, the workflow treats it as the same release identity. If the GitHub Release already exists, its assets are replaced in place.

A retry after a partial infrastructure failure therefore does not consume another product version or Apps Script version.

## Version budget

Apps Script projects have a finite version history. ImportJSON creates Apps Script versions only when **Publish release** is explicitly run, never for pull requests or ordinary `main` commits.
