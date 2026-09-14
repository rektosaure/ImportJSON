import assert from 'node:assert/strict';
import test from 'node:test';

import { isValidPullRequestTitle } from '../scripts/validate-pr-title.mjs';

test('accepts Conventional Commit pull request titles', () => {
  assert.equal(isValidPullRequestTitle('feat: add columnar shaping'), true);
  assert.equal(isValidPullRequestTitle('fix(core): preserve ordering'), true);
  assert.equal(isValidPullRequestTitle('feat!: replace public API'), true);
  assert.equal(isValidPullRequestTitle('docs(user-guide): clarify shapes'), true);
});

test('rejects non-conventional pull request titles', () => {
  assert.equal(isValidPullRequestTitle('Add columnar shaping'), false);
  assert.equal(isValidPullRequestTitle('feat add columnar shaping'), false);
  assert.equal(isValidPullRequestTitle('feat:'), false);
  assert.equal(isValidPullRequestTitle('Feat: add columnar shaping'), false);
});
