import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = process.cwd();
const ROOTS = ['app/app/(shell)', 'components/features'] as const;
const PRIMARY_TAB_ROWS = [
  '<RouteSegmentControl',
  '<AudienceWorkspaceSwitch',
  '<AdminRouteViews',
] as const;
const SECONDARY_TAB_ROWS = [
  '<AppSegmentControl',
  '<SegmentControl',
  '<TabBar',
  '<PageToolbarTabButton',
  '<WorkspaceTabsSurface',
] as const;

/** Branches are exclusive; covered by AdminPage.test. */
const ALLOWLIST = new Set(['components/features/admin/layout/AdminPage.tsx']);

function productionTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) return productionTsxFiles(absolutePath);
    if (
      !entry.name.endsWith('.tsx') ||
      /\.(?:test|stories|states\.stories)\.tsx$/.test(entry.name)
    ) {
      return [];
    }
    return [absolutePath];
  });
}

describe('single tab level', () => {
  it('does not stack a second tab row on a page that already has one', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of productionTsxFiles(join(WEB_ROOT, root))) {
        const rel = relative(WEB_ROOT, file);
        if (ALLOWLIST.has(rel)) continue;
        const source = readFileSync(file, 'utf8');
        const hasPrimary = PRIMARY_TAB_ROWS.some(token =>
          source.includes(token)
        );
        const hasSecondary = SECONDARY_TAB_ROWS.some(token =>
          source.includes(token)
        );
        if (hasPrimary && hasSecondary) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps identity off the audience subheader tab buttons', () => {
    const source = readFileSync(
      join(
        WEB_ROOT,
        'components/features/dashboard/organisms/dashboard-audience-table/AudienceTableSubheader.tsx'
      ),
      'utf8'
    );
    expect(source).not.toContain('PageToolbarTabButton');
  });
});
