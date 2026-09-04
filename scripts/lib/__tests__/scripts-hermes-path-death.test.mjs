/**
 * JOV-5973: ops scripts live under scripts/symphony/. The old package
 * directory must stay gone. Needle is assembled so this file itself is
 * not a live path citation.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const DEAD_DIR = ['scripts', 'hermes'].join('/');
const DEAD_NEEDLE = `${DEAD_DIR}/`;
const CLI_WORKER_PREFIX = `${DEAD_DIR}-cli`;
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  '__pycache__',
  '.turbo',
]);
const HISTORICAL_RELEASE_NOTES = new Set(['CHANGELOG.md']);

function collectLiveCitations(root) {
  const hits = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const full = join(dir, entry.name);
      const rel = relative(root, full).replaceAll('\\', '/');
      if (HISTORICAL_RELEASE_NOTES.has(rel)) continue;
      let text;
      try {
        const stat = statSync(full);
        if (stat.size > 2_000_000) continue;
        text = readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      if (!text.includes(DEAD_NEEDLE) && !text.includes(DEAD_DIR)) continue;
      const lines = text.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line.includes(DEAD_DIR)) continue;
        if (line.includes(CLI_WORKER_PREFIX)) continue;
        hits.push(`${rel}:${index + 1}:${line.trim()}`);
      }
    }
  }
  return hits;
}

describe('JOV-5973 ops package path death', () => {
  it('keeps the retired package directory gone', () => {
    expect(existsSync(join(REPO_ROOT, 'scripts', 'hermes'))).toBe(false);
    expect(existsSync(join(REPO_ROOT, 'scripts', 'symphony'))).toBe(true);
  });

  it('has no live package-path citations outside changelog and the CLI worker', () => {
    expect(collectLiveCitations(REPO_ROOT)).toEqual([]);
  });
});
