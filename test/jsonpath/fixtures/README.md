# JSONPath Compliance Test Suite

`cts.json`, `LICENSE` and `NOTICE` are unmodified copies from
[jsonpath-standard/jsonpath-compliance-test-suite](https://github.com/jsonpath-standard/jsonpath-compliance-test-suite/tree/afefcaa256fb9ed224e9dbffb28ec2262182e498).

- Revision: `afefcaa256fb9ed224e9dbffb28ec2262182e498`
- Retrieved: 2026-09-11
- Cases: 704
- SHA-256 of `cts.json`: `f0932266a108d7b927f9a3fcc56e857f96c2bcd65c2acc25b70f3666b1dce7c3`
- License: BSD-2-Clause; see the accompanying license and notice.

The harness checks values and normalized paths together, preserves node-list
order and duplicates, and accepts only the alternative orders listed by the
suite. Invalid selectors are evaluated against `null`: their validity must not
depend on whether the data causes a filter to run.

`npm test` verifies the pinned SHA-256 before exercising the suite. Tests run
offline after dependencies are installed. Updating the snapshot is an explicit
change requiring renewed qualification; tests never download `main`.
