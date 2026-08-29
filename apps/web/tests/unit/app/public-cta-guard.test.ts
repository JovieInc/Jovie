import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const TARGET_DIRS = [
  join(ROOT, 'app', '(marketing)'),
  join(ROOT, 'components', 'features', 'home'),
  join(ROOT, 'components', 'features', 'pay'),
] as const;
const TARGET_FILES = [
  join(ROOT, 'components', 'organisms', 'HeaderNav.tsx'),
  join(ROOT, 'components', 'molecules', 'AuthActions.tsx'),
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
    const missingFiles = TARGET_FILES.filter(file => !existsSync(file));
    expect(missingDirs).toEqual([]);
    expect(missingFiles).toEqual([]);

    const files = [
      ...TARGET_DIRS.flatMap(dir => collectFiles(dir)),
      ...TARGET_FILES,
    ];

    const offenders = files.filter(filePath => {
      const contents = readFileSync(filePath, 'utf8');
      return LEGACY_CTA_PATTERNS.some(pattern => contents.includes(pattern));
    });

    expect(offenders).toEqual([]);
  });

  it('keeps homepage public auth as a labeled text MarketingSignInLink', () => {
    const headerNav = readFileSync(
      join(ROOT, 'components/organisms/HeaderNav.tsx'),
      'utf8'
    );
    const authActions = readFileSync(
      join(ROOT, 'components/molecules/AuthActions.tsx'),
      'utf8'
    );
    expect(authActions).toContain('export function AuthActions');

    expect(headerNav).toContain("minimalAuthLabel?: 'Sign in' | 'Log in'");
    expect(headerNav).toContain(
      "<MarketingSignInLink variant='ghost' label={minimalLabel} />"
    );
    expect(headerNav).not.toMatch(
      /minimalAuth[\s\S]*?<Button[\s\S]*?>Get started<\/Button>/
    );
  });
});
