import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(
  import.meta.url.startsWith('file:')
    ? fileURLToPath(import.meta.url)
    : import.meta.url
);

const SHELL_APP_ROOT = resolve(TEST_DIR, '../../../app/app/(shell)');

const FORBIDDEN_IMPORT_PATTERNS = [
  {
    label: 'getDashboardDataEssential',
    pattern: /\bgetDashboardDataEssential\b/,
  },
  {
    label: 'getDashboardShellData',
    pattern: /\bgetDashboardShellData\b/,
  },
  {
    label: '@/lib/db',
    pattern: /from\s+['"]@\/lib\/db['"]/,
  },
  {
    label: '@/lib/db/schema',
    pattern: /from\s+['"]@\/lib\/db\/schema(?:\/[^'"]+)?['"]/,
  },
  {
    label: 'drizzle-orm',
    pattern: /from\s+['"]drizzle-orm(?:\/[^'"]+)?['"]/,
  },
] as const;

function collectPageFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const filePath = join(directory, entry);
    const stats = statSync(filePath);
    if (stats.isDirectory()) {
      files.push(...collectPageFiles(filePath));
      continue;
    }

    if (entry === 'page.tsx') {
      files.push(filePath);
    }
  }

  return files;
}

describe('canonical shell route boundary guard', () => {
  it('keeps shell page entrypoints free of low-level bootstrap and db imports', () => {
    const pageFiles = collectPageFiles(SHELL_APP_ROOT);
    const offenders = pageFiles.flatMap(filePath => {
      const source = readFileSync(filePath, 'utf8');
      const matches = FORBIDDEN_IMPORT_PATTERNS.filter(pattern =>
        pattern.pattern.test(source)
      ).map(pattern => `${filePath}: ${pattern.label}`);
      return matches;
    });

    expect(offenders).toEqual([]);
  });
});
