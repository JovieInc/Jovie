import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function findSourceFile(...candidates: string[]): string | undefined {
  return candidates.find(candidate => existsSync(candidate));
}

const RELEASE_PLAN_PAGE = findSourceFile(
  resolve(process.cwd(), 'app/app/(shell)/dashboard/release-plan/page.tsx'),
  resolve(
    process.cwd(),
    'apps/web/app/app/(shell)/dashboard/release-plan/page.tsx'
  )
);

describe('release plan shell contract', () => {
  it('keeps route chrome owned by the app shell', () => {
    expect(RELEASE_PLAN_PAGE).toBeDefined();

    if (!RELEASE_PLAN_PAGE) {
      throw new Error('Could not find release plan page source');
    }

    const source = readFileSync(RELEASE_PLAN_PAGE, 'utf8');
    expect(source).not.toMatch(/<header\b/);
    expect(source).not.toMatch(/<h1\b/);
    expect(source).not.toMatch(/Release plan/);
  });

  it('uses shared tokenized controls instead of raw accent button styles', () => {
    expect(RELEASE_PLAN_PAGE).toBeDefined();

    if (!RELEASE_PLAN_PAGE) {
      throw new Error('Could not find release plan page source');
    }

    const source = readFileSync(RELEASE_PLAN_PAGE, 'utf8');
    expect(source).toContain("import { Button } from '@jovie/ui'");
    expect(source).toContain('<Button');
    expect(source).not.toMatch(/bg-fuchsia-|hover:bg-fuchsia-|shadow\s/);
  });
});
