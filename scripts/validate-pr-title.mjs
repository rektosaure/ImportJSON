import { pathToFileURL } from 'node:url';

const CONVENTIONAL_HEADER = /^[a-z][a-z0-9-]*(?:\([^\r\n()]+\))?!?: [^\r\n]+$/;

export function isValidPullRequestTitle(title) {
  return typeof title === 'string' && CONVENTIONAL_HEADER.test(title);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const title = process.argv[2] ?? '';
  if (!isValidPullRequestTitle(title)) {
    console.error(
      'Pull request title must use Conventional Commit format, for example "feat: add columnar shaping" or "fix(core): preserve ordering".',
    );
    process.exitCode = 1;
  }
}
