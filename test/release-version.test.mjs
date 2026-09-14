import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyCommit,
  highestBump,
  nextVersion,
  parseSemverTag,
} from '../scripts/next-release.mjs';

test('parseSemverTag accepts strict v-prefixed SemVer tags', () => {
  assert.deepEqual(parseSemverTag('v1.2.3'), { major: 1, minor: 2, patch: 3 });
  assert.equal(parseSemverTag('1.2.3'), null);
  assert.equal(parseSemverTag('v1.2'), null);
});

test('classifyCommit maps conventional commits to release bumps', () => {
  assert.equal(classifyCommit('fix: correct request handling'), 'patch');
  assert.equal(classifyCommit('feat(core): add shaping mode'), 'minor');
  assert.equal(classifyCommit('feat!: replace public API'), 'major');
  assert.equal(classifyCommit('fix: preserve behavior\n\nBREAKING CHANGE: remove legacy mode'), 'major');
  assert.equal(classifyCommit('docs: clarify examples'), null);
});

test('highestBump returns the strongest release signal', () => {
  assert.equal(highestBump(['fix: one', 'feat: two', 'docs: three']), 'minor');
  assert.equal(highestBump(['fix: one', 'feat!: two']), 'major');
  assert.equal(highestBump(['ci: one', 'docs: two']), null);
});

test('first release is v1.0.0', () => {
  assert.equal(nextVersion(null, 'patch'), '1.0.0');
  assert.equal(nextVersion(null, 'minor'), '1.0.0');
  assert.equal(nextVersion(null, 'major'), '1.0.0');
});

test('subsequent releases use normal SemVer increments', () => {
  assert.equal(nextVersion('1.2.3', 'patch'), '1.2.4');
  assert.equal(nextVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(nextVersion('1.2.3', 'major'), '2.0.0');
});
