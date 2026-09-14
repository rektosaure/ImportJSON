import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const BUMP_RANK = {
  patch: 1,
  minor: 2,
  major: 3,
};

export function parseSemverTag(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function classifyCommit(message) {
  const [header = ''] = message.split('\n');
  const breakingHeader = /^[a-z][a-z0-9-]*(?:\([^\n)]+\))?!:/;
  const breakingFooter = /^BREAKING(?: |-)?CHANGE:/m;

  if (breakingHeader.test(header) || breakingFooter.test(message)) return 'major';
  if (/^feat(?:\([^\n)]+\))?:/.test(header)) return 'minor';
  if (/^fix(?:\([^\n)]+\))?:/.test(header)) return 'patch';
  return null;
}

export function highestBump(messages) {
  let bump = null;
  for (const message of messages) {
    const candidate = classifyCommit(message);
    if (candidate && (!bump || BUMP_RANK[candidate] > BUMP_RANK[bump])) {
      bump = candidate;
    }
  }
  return bump;
}

export function nextVersion(previousVersion, bump) {
  if (!previousVersion) return '1.0.0';
  if (!bump) return null;

  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(previousVersion);
  if (!match) throw new Error(`Invalid previous version: ${previousVersion}`);

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);

  if (bump === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump === 'minor') {
    minor += 1;
    patch = 0;
  } else if (bump === 'patch') {
    patch += 1;
  } else {
    throw new Error(`Unknown bump: ${bump}`);
  }

  return `${major}.${minor}.${patch}`;
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function semverTags(output) {
  return output
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => parseSemverTag(value));
}

function commitMessages(range) {
  const output = execFileSync('git', ['log', '--format=%B%x1e', range], { encoding: 'utf8' });
  return output
    .split('\x1e')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function createReleasePlan() {
  const headTags = semverTags(git('tag', '--points-at', 'HEAD', '--list', 'v*', '--sort=-v:refname'));
  if (headTags.length > 0) {
    const tagName = headTags[0];
    return {
      mode: 'retry',
      bump: null,
      previousTag: null,
      version: tagName.slice(1),
      tagName,
    };
  }

  const mergedTags = semverTags(git('tag', '--merged', 'HEAD', '--list', 'v*', '--sort=-v:refname'));
  const previousTag = mergedTags[0] ?? null;

  if (!previousTag) {
    return {
      mode: 'new',
      bump: null,
      previousTag: null,
      version: '1.0.0',
      tagName: 'v1.0.0',
    };
  }

  const previousVersion = previousTag.slice(1);
  const messages = commitMessages(`${previousTag}..HEAD`);
  const bump = highestBump(messages);
  if (!bump) {
    throw new Error(`No releasable Conventional Commit found in ${previousTag}..HEAD.`);
  }

  const version = nextVersion(previousVersion, bump);
  return {
    mode: 'new',
    bump,
    previousTag,
    version,
    tagName: `v${version}`,
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    process.stdout.write(`${JSON.stringify(createReleasePlan())}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
