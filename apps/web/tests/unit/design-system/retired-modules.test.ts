import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import retired from '@/data/designSystem/retired-modules.json';

/**
 * Retired design-system module gate (zero tolerance, not a ratchet).
 *
 * `data/designSystem/retired-modules.json` lists forks and compatibility
 * shims that were deleted in favor of a canonical owner. This test fails when
 * a retired file is recreated, when any source, story, or test imports or
 * mocks a retired specifier, or when a retired export name reappears. ESLint
 * reads the same registry for author-time feedback.
 *
 * Retiring a fork: migrate consumers, delete the file, add a registry row.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');
const SCAN_DIRS = ['app', 'components', 'lib', 'hooks', 'tests'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'fixtures']);
const SOURCE_EXT = /\.(tsx?|mts|mjs)$/;
const THIS_FILE = relative(WEB_ROOT, fileURLToPath(import.meta.url));

interface RetiredModule {
  readonly specifiers: readonly string[];
  readonly source: string;
  readonly replacement: string;
  readonly replacementSource: string;
}

interface RetiredExport {
  readonly name: string;
  readonly source: string;
  readonly replacement: string;
}

const MODULES = retired.modules as readonly RetiredModule[];
const EXPORTS = retired.exports as readonly RetiredExport[];

function walk(directory: string, output: string[]): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) walk(full, output);
    else if (SOURCE_EXT.test(entry)) output.push(full);
  }
}

/** Reads every scanned source once: [web-relative path, contents]. */
function readSources(): readonly (readonly [string, string])[] {
  const files: string[] = [];
  for (const directory of SCAN_DIRS) walk(join(WEB_ROOT, directory), files);
  return files
    .map(file => relative(WEB_ROOT, file))
    .filter(file => file !== THIS_FILE)
    .map(file => [file, readFileSync(join(WEB_ROOT, file), 'utf8')] as const);
}

/** Case-sensitive existence check, so `Sidebar.tsx` != `sidebar/`. */
function existsExactCase(relativePath: string): boolean {
  const full = join(WEB_ROOT, relativePath);
  const parent = dirname(full);
  return existsSync(parent) && readdirSync(parent).includes(basename(full));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('retired design-system modules', () => {
  const sources = readSources();

  it('keeps the registry well-formed with live replacements', () => {
    expect(retired.schema).toBe('jovie.ds-retired-modules/v1');
    for (const entry of MODULES) {
      expect(entry.specifiers.length).toBeGreaterThan(0);
      expect(
        existsExactCase(entry.replacementSource),
        `${entry.replacementSource} (replacement for ${entry.source}) must exist`
      ).toBe(true);
    }
  });

  it('never recreates a retired module file', () => {
    const recreated = MODULES.filter(entry => existsExactCase(entry.source));
    expect(
      recreated.map(entry => `${entry.source} -> use ${entry.replacement}`)
    ).toEqual([]);
  });

  it('never imports or mocks a retired specifier', () => {
    const violations: string[] = [];
    for (const entry of MODULES) {
      const pattern = new RegExp(
        `['"](?:${entry.specifiers.map(escapeRegExp).join('|')})['"]`
      );
      for (const [file, contents] of sources) {
        if (pattern.test(contents)) {
          violations.push(`${file} -> use ${entry.replacement}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('never reintroduces a retired export', () => {
    const violations: string[] = [];
    for (const entry of EXPORTS) {
      const pattern = new RegExp(`\\b${escapeRegExp(entry.name)}\\b`);
      for (const [file, contents] of sources) {
        if (pattern.test(contents)) {
          violations.push(`${file}: ${entry.name} -> use ${entry.replacement}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
