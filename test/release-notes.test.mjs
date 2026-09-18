import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReleaseNotes, parseCommitSubject } from '../scripts/release-notes.mjs';

test('parseCommitSubject extracts conventional type, breaking marker, and PR number', () => {
  assert.deepEqual(parseCommitSubject('feat(core)!: change output shape (#42)'), {
    type: 'feat',
    breaking: true,
    description: 'change output shape',
    prNumber: 42,
  });
});

test('buildReleaseNotes groups user-facing, documentation, and maintenance changes', () => {
  const notes = buildReleaseNotes({
    repository: 'rektosaure/ImportJSON',
    subjects: [
      'feat: bound import resource usage (#27)',
      'docs: add live Google Sheets demo (#28)',
      'chore: prepare immutable GitHub releases (#26)',
      'perf: extend HTTP cache TTL to one hour (#24)',
    ],
    generatedNotes: '## What\'s Changed\n* generated detail',
  });

  assert.equal(notes, `## ✨ Highlights

- **New:** Bound import resource usage ([#27](https://github.com/rektosaure/ImportJSON/pull/27))
- **Performance:** Extend HTTP cache TTL to one hour ([#24](https://github.com/rektosaure/ImportJSON/pull/24))

## 📚 Documentation

- Add live Google Sheets demo ([#28](https://github.com/rektosaure/ImportJSON/pull/28))

## 🛠 Maintenance

- Prepare immutable GitHub releases ([#26](https://github.com/rektosaure/ImportJSON/pull/26))

---

## What's Changed
* generated detail
`);
});

test('buildReleaseNotes keeps breaking and non-conventional changes visible', () => {
  const notes = buildReleaseNotes({
    repository: 'owner/repo',
    subjects: [
      'feat!: replace public API (#8)',
      'release housekeeping',
    ],
    generatedNotes: '',
  });

  assert.equal(notes, `## ⚠️ Breaking changes

- Replace public API ([#8](https://github.com/owner/repo/pull/8))

## Other changes

- Release housekeeping
`);
});
