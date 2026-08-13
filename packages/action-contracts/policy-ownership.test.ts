import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Policy-ownership guard: the contract package declares shape and metadata
 * only. Executable business policy (entitlement evaluation, flag checks,
 * persistence, network, env access) belongs to the future dispatcher and
 * must never be implemented here or duplicated into adapters.
 */

const PACKAGE_ROOT = import.meta.dirname;

function collectFiles(dir: string, extension: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'generated') continue;
    const absolute = join(dir, entry);
    if (statSync(absolute).isDirectory()) {
      files.push(...collectFiles(absolute, extension));
    } else if (entry.endsWith(extension)) {
      files.push(absolute);
    }
  }
  return files;
}

const FORBIDDEN_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly reason: string;
}> = [
  {
    pattern: /from ['"]@jovie\/(?!action-contracts)/,
    reason: 'no imports from other workspace packages',
  },
  {
    pattern: /apps\/web|lib\/entitlements|lib\/flags|lib\/rate-limit/,
    reason: 'no references to app-owned policy modules',
  },
  {
    pattern: /getEntitlements|getCurrentUserEntitlements|ENTITLEMENT_REGISTRY/,
    reason: 'no entitlement evaluation',
  },
  {
    pattern: /\bisPro\b/,
    reason: 'no plan checks',
  },
  {
    pattern: /process\.env/,
    reason: 'no environment access',
  },
  {
    pattern: /\bfetch\(|drizzle|sql`/,
    reason: 'no network or persistence',
  },
];

describe('policy ownership', () => {
  const sources = collectFiles(PACKAGE_ROOT, '.ts').filter(
    file => !file.endsWith('.test.ts') && !file.endsWith('generate.ts')
  );

  it('has contract sources to guard', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('contract sources contain no executable business policy', () => {
    const violations: string[] = [];
    for (const file of sources) {
      const contents = readFileSync(file, 'utf8');
      for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
        if (pattern.test(contents)) {
          violations.push(
            `${relative(PACKAGE_ROOT, file)}: ${reason} (${pattern})`
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('depends only on zod at runtime', () => {
    const manifest = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')
    ) as { dependencies?: Record<string, string> };
    expect(Object.keys(manifest.dependencies ?? {})).toEqual(['zod']);
  });

  it('bindings/ is documentation-only (no runtime claims or code)', () => {
    const bindingFiles = readdirSync(join(PACKAGE_ROOT, 'bindings'));
    expect(bindingFiles.length).toBeGreaterThan(0);
    for (const file of bindingFiles) {
      expect(file.endsWith('.md')).toBe(true);
    }
  });
});
