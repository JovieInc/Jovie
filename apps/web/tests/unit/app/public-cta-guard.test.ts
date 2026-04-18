import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const TARGET_DIRS = [
  join(ROOT, 'app', '(marketing)'),
  join(ROOT, 'components', 'features', 'home'),
  join(ROOT, 'components', 'features', 'pay'),
] as const;

const LEGACY_CTA_PATTERNS = [
  'btn-linear-login',
  'btn-linear-signup',
  'marketing-cta',
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

describe('public CTA guard', () => {
  it('keeps legacy public CTA classnames out of production marketing and key public feature surfaces', () => {
    const missingDirs = TARGET_DIRS.filter(dir => !existsSync(dir));
    expect(missingDirs).toEqual([]);

    const files = TARGET_DIRS.flatMap(dir => collectFiles(dir));

    const offenders = files.filter(filePath => {
      const contents = readFileSync(filePath, 'utf8');
      return LEGACY_CTA_PATTERNS.some(pattern => contents.includes(pattern));
    });

    expect(offenders).toEqual([]);
  });
});
