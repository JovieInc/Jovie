import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');

const SKIP_DIRS = new Set(['node_modules', '.next', 'out', 'dist', 'coverage']);

function collectCssFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...collectCssFiles(path));
    } else if (entry.name.endsWith('.css')) {
      files.push(path);
    }
  }
  return files;
}

const CSS_FILES = collectCssFiles(WEB_ROOT);

// JOV-6534: `var(--space-7)` and friends silently resolved empty because the
// canonical scale skipped those steps, collapsing the profile dock indicator
// to a 2px line. Every referenced --space-* token must be defined in some
// shipped stylesheet.
describe('spacing token resolution', () => {
  it('defines every --space-* token referenced by var()', () => {
    const defined = new Set<string>();
    const sources = CSS_FILES.map(file => readFileSync(file, 'utf8'));
    for (const source of sources) {
      for (const match of source.matchAll(/(--space-[\w-]+)\s*:/g)) {
        defined.add(match[1]);
      }
    }

    const unresolved: string[] = [];
    CSS_FILES.forEach((file, index) => {
      for (const match of sources[index].matchAll(
        /var\(\s*(--space-[\w-]+)/g
      )) {
        if (!defined.has(match[1])) {
          unresolved.push(`${relative(WEB_ROOT, file)} references ${match[1]}`);
        }
      }
    });

    expect(unresolved).toEqual([]);
  });

  it('keeps the canonical scale contiguous steps it claims', () => {
    const designSystem = readFileSync(
      join(WEB_ROOT, 'styles', 'design-system.css'),
      'utf8'
    );
    for (const token of [
      '--space-3-5: 0.875rem;',
      '--space-7: 1.75rem;',
      '--space-9: 2.25rem;',
    ]) {
      expect(designSystem).toContain(token);
    }
  });
});
