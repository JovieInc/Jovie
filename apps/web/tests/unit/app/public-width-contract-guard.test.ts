import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), 'app');
const TARGET_DIRS = [
  join(ROOT, '(marketing)'),
  join(ROOT, '(dynamic)', 'legal'),
  join(ROOT, '[username]'),
] as const;

const BLOCKED_PATTERNS = [
  '@/components/site/Container',
  'max-w-[1100px]',
  'max-w-[720px] px-6 sm:px-8 lg:px-10',
  'flex max-w-[480px] flex-col items-center px-4 py-12',
] as const;

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

describe('public width contract guard', () => {
  it('keeps production public routes off legacy container imports and blocked layout-wrapper widths', () => {
    const files = TARGET_DIRS.flatMap(dir => collectFiles(dir));

    const offenders = files.filter(filePath => {
      const contents = readFileSync(filePath, 'utf8');
      return BLOCKED_PATTERNS.some(pattern => contents.includes(pattern));
    });

    expect(offenders).toEqual([]);
  });
});
