# Security Policy

## Supported versions

Security fixes are developed on `main` and shipped in a new release. The latest published release is supported; older releases may not receive backports.

## Before reporting

Documented security-relevant behavior, including shared Library cache scope and guidance for sensitive URLs, is described in the [User Guide](docs/user-guide.md#sensitive-urls).

If observed behavior exceeds that documented model, can expose data beyond the intended scope, or otherwise appears exploitable, report it privately.

## Reporting a vulnerability

Do not disclose suspected vulnerabilities in a public issue, discussion, pull request, or comment.

Use GitHub's private vulnerability reporting flow when it is available for this repository. If it is unavailable, contact the repository maintainer through their GitHub profile before sharing technical details publicly.

Include enough information to reproduce and assess the issue:

- affected ImportJSON version or commit;
- installation mode and relevant Google Apps Script or Google Sheets context;
- minimal reproduction steps;
- expected and observed security impact;
- a proof of concept, when one can be shared safely.

Avoid accessing data that is not yours, disrupting third-party services, or publishing exploit details before the issue can be assessed.
