import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FEATURE_FLAG_KEYS } from '@/lib/feature-flags/shared';

const SOURCE_DIRECTORIES = ['app', 'components', 'hooks', 'lib'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '__tests__',
  '.next',
  'dist',
  'build',
  'coverage',
]);

/**
 * Derive flag literal prefixes dynamically from the canonical registry so the
 * regex stays comprehensive as new naming schemes are added.
 */
function buildFlagLiteralRegex(): RegExp {
  const prefixes = Array.from(
    new Set(
      Object.values(FEATURE_FLAG_KEYS)
        .map(flag => {
          const match = flag.match(/^([a-z0-9]+[_.])/);
          return match ? match[1] : null;
        })
        .filter((prefix): prefix is string => prefix !== null)
    )
  );

  function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  const alternatives = prefixes
    .map(prefix => `${escapeRegex(prefix)}[A-Za-z0-9_.]+`)
    .join('|');

  return new RegExp(`['\`"](${alternatives})['\`"]`, 'g');
}

const FEATURE_FLAG_LITERAL_REGEX = buildFlagLiteralRegex();

/** Stable package root resolved from this test file's location. */
const TEST_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(TEST_FILE_DIR, '../../..');

/**
 * Recursively collect source files from the given root directory, skipping
 * common generated/build folders to keep CI fast.
 */
function collectSourceFiles(rootDir: string): string[] {
  const files: string[] = [];

  function walk(currentPath: string): void {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (SKIP_DIRECTORIES.has(entry.name)) continue;

      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }

  for (const dir of SOURCE_DIRECTORIES) {
    const absoluteDir = path.join(rootDir, dir);
    if (!existsSync(absoluteDir)) continue;
    walk(absoluteDir);
  }

  return files;
}

describe('feature flag registry integrity', () => {
  it('keeps all production feature-flag literals registered', () => {
    const sourceFiles = collectSourceFiles(WEB_ROOT);

    const registeredFlags = new Set<string>(Object.values(FEATURE_FLAG_KEYS));
    const discoveredFlags = new Set<string>();

    for (const sourceFile of sourceFiles) {
      const source = readFileSync(sourceFile, 'utf8');
      const matches = source.matchAll(FEATURE_FLAG_LITERAL_REGEX);

      for (const [, flag] of matches) {
        discoveredFlags.add(flag);
      }
    }

    const unregisteredFlags = [...discoveredFlags]
      .filter(flag => !registeredFlags.has(flag))
      .sort();

    expect(unregisteredFlags).toEqual([]);
  });

  it('does not include chat-specific feature flags in the registry', () => {
    const chatFlagsInKeys = Object.keys(FEATURE_FLAG_KEYS).filter(key =>
      /chat/i.test(key)
    );
    const chatFlagsInValues = Object.values(FEATURE_FLAG_KEYS).filter(flag =>
      /chat/i.test(flag)
    );

    expect([...chatFlagsInKeys, ...chatFlagsInValues]).toEqual([]);
  });
});
