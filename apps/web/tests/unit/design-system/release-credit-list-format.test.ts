import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ds-cert:credit-format — ONE formatter for release credit lists.
 *
 * Release surfaces must render artist/credit name lists through
 * `@/lib/discography/formatting` (or the CreditList molecule built on it),
 * never through a local join. This contract test greps the known release
 * surface directories for:
 *
 *  - artistNames/collaborators/creditNames joined with a bare `.join(...)`
 *  - the '&' conjunction idiom for credit lists
 *  - `new Intl.ListFormat` instances outside the canonical module
 *
 * The ALLOWLIST is the only sanctioned exception surface and may only SHRINK:
 * its length is pinned, so growing it fails here. Convert the surface to the
 * canonical formatter instead of adding an entry.
 */

const RELEASE_SURFACE_DIRECTORIES = [
  'components/features/dashboard/organisms/release-provider-matrix',
  'components/features/dashboard/organisms/releases',
  'components/features/demo',
  'components/features/profile',
  'components/features/release',
  'components/organisms/release-sidebar',
  'components/shell',
  'app/r/[slug]',
] as const;

const CREDIT_JOIN_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> =
  [
    {
      label: 'optional-chained credit-name join',
      pattern: /(?:artistNames|collaborators|creditNames)\s*\?\s*\.\s*join\(/,
    },
    {
      label: 'direct credit-name join',
      pattern: /(?:artistNames|collaborators|creditNames)\s*\.\s*join\(/,
    },
    {
      label: "ampersand conjunction join(' & ')",
      pattern: /\.join\(\s*['"] & ['"]\s*\)/,
    },
    {
      label: 'Intl.ListFormat instance outside the canonical module',
      pattern: /new\s+Intl\.ListFormat/,
    },
  ];

/** Explicit exceptions — may only shrink (length pinned below). */
const ALLOWLIST: ReadonlyArray<string> = [];
const ALLOWLIST_MAX_ENTRIES = 0;

function listSourceFiles(dir: string, files: string[] = []): string[] {
  const webRoot = process.cwd().endsWith('/apps/web')
    ? process.cwd()
    : resolve(process.cwd(), 'apps/web');
  const absDir = resolve(webRoot, dir);
  let entries: Array<{
    name: string;
    isDirectory(): boolean;
  }> = [];
  try {
    entries = readdirSync(absDir, { withFileTypes: true }) as never[] as Array<{
      name: string;
      isDirectory(): boolean;
    }>;
  } catch {
    return files;
  }
  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      listSourceFiles(rel, files);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.(test|spec|stories)\.[jt]sx?$/.test(entry.name)) continue;
    files.push(rel);
  }
  return files;
}

function findCreditJoinViolations(): Array<{ file: string; label: string }> {
  const webRoot = process.cwd().endsWith('/apps/web')
    ? process.cwd()
    : resolve(process.cwd(), 'apps/web');
  const violations: Array<{ file: string; label: string }> = [];
  for (const dir of RELEASE_SURFACE_DIRECTORIES) {
    for (const relPath of listSourceFiles(dir)) {
      if (ALLOWLIST.includes(relPath)) continue;
      const source = readFileSync(resolve(webRoot, relPath), 'utf8');
      for (const { label, pattern } of CREDIT_JOIN_PATTERNS) {
        if (pattern.test(source)) {
          violations.push({ file: relPath, label });
        }
      }
    }
  }
  return violations;
}

describe('release credit list format contract (ds-cert:credit-format)', () => {
  it('keeps the allowlist shrink-only', () => {
    expect(ALLOWLIST.length).toBeLessThanOrEqual(ALLOWLIST_MAX_ENTRIES);
  });

  it('renders every release-surface credit list through the canonical formatter', () => {
    const violations = findCreditJoinViolations();
    expect(
      violations,
      'Release surfaces must format credit lists via @/lib/discography/formatting (or CreditList), never a local join. Violations:\n' +
        violations.map(v => `  ${v.file}: ${v.label}`).join('\n')
    ).toEqual([]);
  });
});
