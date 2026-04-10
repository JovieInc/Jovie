import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), 'app');
const MARKETING_ROOT = join(ROOT, '(marketing)');
const LEGAL_ROOT = join(ROOT, '(dynamic)', 'legal');

function collectFiles(dir: string, results: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      collectFiles(fullPath, results);
      continue;
    }

    if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }

  return results;
}

describe('public route container guard', () => {
  it('does not import legacy site Container in production marketing and legal routes', () => {
    const files = [
      ...collectFiles(MARKETING_ROOT),
      ...collectFiles(LEGAL_ROOT),
    ];

    const offenders = files.filter(filePath =>
      readFileSync(filePath, 'utf8').includes('@/components/site/Container')
    );

    expect(offenders).toEqual([]);
  });
});
