import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function findSourceFile(...candidates: string[]): string {
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Could not find source file. Checked: ${candidates.join(', ')}`
    );
  }
  return found;
}

const FEATURE_FLAGS_PAGE = findSourceFile(
  resolve(process.cwd(), 'app/app/(shell)/feature-flags/page.tsx'),
  resolve(process.cwd(), 'apps/web/app/app/(shell)/feature-flags/page.tsx')
);

describe('feature flags shell normalization', () => {
  it('keeps feature flags in the shared admin tool shell', () => {
    const source = readFileSync(FEATURE_FLAGS_PAGE, 'utf8');

    expect(source).toContain('AdminToolPage');
    expect(source).toContain("testId='feature-flags-page'");
    expect(source).toContain('ContentSurfaceCard');
  });

  it('uses shared content table primitives instead of bespoke table chrome', () => {
    const source = readFileSync(FEATURE_FLAGS_PAGE, 'utf8');

    expect(source).toContain('ContentTable');
    expect(source).toContain('CONTENT_TABLE_HEAD_CELL_CLASS');
    expect(source).toContain('CONTENT_TABLE_ROW_CLASS');
    expect(source).not.toContain('max-w-3xl');
    expect(source).not.toContain("className='w-full text-sm'");
  });
});
