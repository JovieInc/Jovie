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
const FEATURE_FLAGS_TABLE = findSourceFile(
  resolve(process.cwd(), 'app/app/(shell)/feature-flags/FeatureFlagsTable.tsx'),
  resolve(
    process.cwd(),
    'apps/web/app/app/(shell)/feature-flags/FeatureFlagsTable.tsx'
  )
);

describe('feature flags shell normalization', () => {
  it('keeps feature flags in the shared admin page shell', () => {
    const source = readFileSync(FEATURE_FLAGS_PAGE, 'utf8');

    expect(source).toContain('AdminPage');
    expect(source).toContain("testId='feature-flags-page'");
    expect(source).toContain('loadAppShellRouteContext');
    expect(source).toContain("title=''");
    expect(source).not.toContain('description=');
    expect(source).not.toContain('getCachedAuth');
    expect(source).not.toContain('getDashboardDataEssential');
    expect(source).not.toContain('getDashboardShellData');
  });

  it('uses shared admin table primitives instead of bespoke table chrome', () => {
    const pageSource = readFileSync(FEATURE_FLAGS_PAGE, 'utf8');
    const tableSource = readFileSync(FEATURE_FLAGS_TABLE, 'utf8');

    expect(pageSource).toContain('FeatureFlagsTable');
    expect(tableSource).toContain('AdminTableShell');
    expect(tableSource).toContain('AdminTableSubheader');
    expect(tableSource).toContain('AdminDataTable');
    expect(pageSource).not.toContain('ContentTable');
    expect(pageSource).not.toContain('ContentSurfaceCard');
    expect(pageSource).not.toContain('CONTENT_TABLE_HEAD_CELL_CLASS');
    expect(pageSource).not.toContain('CONTENT_TABLE_ROW_CLASS');
    expect(tableSource).not.toMatch(/<table\b/);
  });
});
