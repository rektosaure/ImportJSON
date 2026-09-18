import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const CHANGE_LABELS = new Map([
  ['feat', 'New'],
  ['fix', 'Fixed'],
  ['perf', 'Performance'],
]);

const MAINTENANCE_TYPES = new Set([
  'build',
  'chore',
  'ci',
  'refactor',
  'style',
  'test',
]);

export function parseCommitSubject(subject) {
  const match = /^(?<type>[a-z]+)(?:\([^)]+\))?(?<breaking>!)?:\s+(?<description>.+)$/.exec(subject.trim());
  if (!match) return null;

  let description = match.groups.description.trim();
  let prNumber = null;
  const prMatch = /\s+\(#(?<number>\d+)\)$/.exec(description);
  if (prMatch) {
    prNumber = Number(prMatch.groups.number);
    description = description.slice(0, prMatch.index).trim();
  }

  return {
    type: match.groups.type,
    breaking: Boolean(match.groups.breaking),
    description,
    prNumber,
  };
}

function sentenceCase(value) {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}

function formatChange(change, repository) {
  const text = sentenceCase(change.description);
  if (!change.prNumber) return text;
  return `${text} ([#${change.prNumber}](https://github.com/${repository}/pull/${change.prNumber}))`;
}

function renderSection(title, lines) {
  if (lines.length === 0) return '';
  return `${title}\n\n${lines.join('\n')}`;
}

export function buildReleaseDigest(subjects, repository) {
  const groups = {
    breaking: [],
    highlights: [],
    docs: [],
    maintenance: [],
    other: [],
  };

  for (const subject of subjects) {
    const change = parseCommitSubject(subject);
    if (!change) {
      groups.other.push(`- ${sentenceCase(subject.trim())}`);
      continue;
    }

    const formatted = formatChange(change, repository);
    if (change.breaking) {
      groups.breaking.push(`- ${formatted}`);
    } else if (CHANGE_LABELS.has(change.type)) {
      groups.highlights.push(`- **${CHANGE_LABELS.get(change.type)}:** ${formatted}`);
    } else if (change.type === 'docs') {
      groups.docs.push(`- ${formatted}`);
    } else if (MAINTENANCE_TYPES.has(change.type)) {
      groups.maintenance.push(`- ${formatted}`);
    } else {
      groups.other.push(`- ${formatted}`);
    }
  }

  return [
    renderSection('## ⚠️ Breaking changes', groups.breaking),
    renderSection('## ✨ Highlights', groups.highlights),
    renderSection('## 📚 Documentation', groups.docs),
    renderSection('## 🛠 Maintenance', groups.maintenance),
    renderSection('## Other changes', groups.other),
  ].filter(Boolean).join('\n\n');
}

export function buildReleaseNotes({ subjects, repository, generatedNotes }) {
  const digest = buildReleaseDigest(subjects, repository);
  const details = generatedNotes.trim();

  if (!digest) return `${details}\n`;
  if (!details) return `${digest}\n`;
  return `${digest}\n\n---\n\n${details}\n`;
}

function main() {
  const [subjectsPath, generatedNotesPath, outputPath, repository] = process.argv.slice(2);
  if (!subjectsPath || !generatedNotesPath || !outputPath || !repository) {
    throw new Error('usage: node scripts/release-notes.mjs <subjects> <generated-notes> <output> <owner/repo>');
  }

  const subjects = readFileSync(subjectsPath, 'utf8')
    .split(/\r?\n/)
    .map((subject) => subject.trim())
    .filter(Boolean);
  const generatedNotes = readFileSync(generatedNotesPath, 'utf8');
  const notes = buildReleaseNotes({ subjects, repository, generatedNotes });
  writeFileSync(outputPath, notes);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
