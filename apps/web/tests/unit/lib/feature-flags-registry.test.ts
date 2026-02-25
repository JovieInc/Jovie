import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { FEATURE_FLAG_KEYS } from '@/lib/feature-flags/shared';

const SOURCE_DIRECTORIES = ['app', 'components', 'hooks', 'lib'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

const FEATURE_FLAG_LITERAL_REGEX =
  /['"`](feature_[a-z0-9_.]+|billing\.upgradeDirect|experiment_[a-z0-9_.]+)['"`]/g;

function collectSourceFiles(rootDir: string): string[] {
  const files: string[] = [];

  function walk(currentPath: string): void {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') continue;
      if (entry.name === '__tests__') continue;

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
    walk(path.join(rootDir, dir));
  }

  return files;
}

describe('feature flag registry integrity', () => {
  it('keeps all production feature-flag literals registered', () => {
    const root = process.cwd();
    const sourceFiles = collectSourceFiles(root);

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
    const chatFlags = Object.values(FEATURE_FLAG_KEYS).filter(flag =>
      /chat/i.test(flag)
    );

    expect(chatFlags).toEqual([]);
  });
});
