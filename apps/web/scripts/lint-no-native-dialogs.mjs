#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd(), '..', '..');
const SCAN_ROOTS = ['apps/web', 'packages'].map(p => resolve(REPO_ROOT, p));

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.cache',
  'storybook-static',
]);

const SKIP_FILE_PATTERNS = [
  /\.test\.(ts|tsx)$/,
  /\.spec\.(ts|tsx)$/,
  /\.stories\.tsx$/,
];

const SKIP_PATH_SEGMENTS = ['/scripts/', '/tests/', '/.storybook/'];

// Biome's `noRestrictedGlobals` (style.noRestrictedGlobals at error level) is
// AST-aware and catches bare `alert(...)` / `confirm(...)` / `prompt(...)`
// while correctly distinguishing global calls from same-name local variables
// (e.g. destructured props, hook return values). This script only catches
// member-expression forms that Biome cannot match against globals:
//   globalThis.alert(...)  /  window.confirm(...)  /  self.prompt(...)
const FORBIDDEN = /\b(globalThis|window|self)\.(alert|confirm|prompt)\s*\(/g;

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.storybook') {
      if (entry.name !== '.next' && entry.name !== '.cache') continue;
    }
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      yield full;
    }
  }
}

function isSkippedFile(absPath) {
  if (SKIP_FILE_PATTERNS.some(rx => rx.test(absPath))) return true;
  if (SKIP_PATH_SEGMENTS.some(seg => absPath.includes(seg))) return true;
  return false;
}

const matches = [];
for (const root of SCAN_ROOTS) {
  try {
    const stats = await stat(root);
    if (!stats.isDirectory()) continue;
  } catch {
    continue;
  }
  for await (const file of walk(root)) {
    if (isSkippedFile(file)) continue;
    const text = await readFile(file, 'utf8');
    let match;
    FORBIDDEN.lastIndex = 0;
    while ((match = FORBIDDEN.exec(text)) !== null) {
      const before = text.slice(0, match.index);
      const line = before.split('\n').length;
      const column = match.index - before.lastIndexOf('\n');
      const offending = `${match[1]}.${match[2]}`;
      const lineText = text.split('\n')[line - 1].trim().slice(0, 120);
      matches.push({
        file: relative(REPO_ROOT, file),
        line,
        column,
        offending,
        lineText,
      });
    }
  }
}

if (matches.length > 0) {
  console.error('Native browser dialogs are banned (AGENTS.md §4f).');
  console.error('Use <ConfirmDialog> for confirmations or toast.error/success for notifications.\n');
  for (const m of matches) {
    console.error(`  ${m.file}:${m.line}:${m.column}  ${m.offending}(...)  →  ${m.lineText}`);
  }
  console.error(`\n${matches.length} match${matches.length === 1 ? '' : 'es'} found.`);
  process.exit(1);
}

console.log('No native browser dialogs found.');
