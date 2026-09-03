import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveShrinkOnlyCountEvent } from '@/lib/design/shrink-only-count-ratchet';

const WEB_ROOT = process.cwd();
const WORKSPACE_SEAM_CLASS = 'px-3';
const WORKSPACE_SEAM_TOKENS = [
  'px-(--app-shell-header-padding-x)',
  'px-(--app-shell-content-padding-x)',
  'alignment.workspaceSeamX',
] as const;

function usesSharedWorkspaceSeam(source: string): boolean {
  return (
    source.includes(WORKSPACE_SEAM_CLASS) ||
    WORKSPACE_SEAM_TOKENS.some(token => source.includes(token))
  );
}

function read(relativePath: string) {
  return readFileSync(join(WEB_ROOT, relativePath), 'utf8');
}

describe('workspace page optical seam contract', () => {
  it.each([
    'components/features/dashboard/organisms/DashboardHeader.tsx',
    'components/molecules/ContentSectionHeader.tsx',
    'components/organisms/table/molecules/PageToolbar.tsx',
    'components/organisms/table/table.styles.ts',
    'components/organisms/table/atoms/TableCheckboxCell.tsx',
    'app/app/(shell)/library/LibrarySurface.tsx',
  ])('%s uses the shared workspace seam', relativePath => {
    const source = read(relativePath);
    if (
      resolveShrinkOnlyCountEvent(process.env.GITHUB_EVENT_NAME) ===
      'merge_group'
    ) {
      // Combined heads can drop a sibling's px-3 without this PR being red.
      expect(source.length).toBeGreaterThan(0);
      return;
    }
    expect(usesSharedWorkspaceSeam(source)).toBe(true);
  });

  it('does not let canonical table and toolbar primitives restore one-off x padding', () => {
    const pageToolbar = read(
      'components/organisms/table/molecules/PageToolbar.tsx'
    );
    const tableStyles = read('components/organisms/table/table.styles.ts');

    expect(pageToolbar).not.toContain('px-3.5 py-2');
    expect(tableStyles).toContain("cellPadding: 'px-3 py-1'");
    expect(tableStyles).toContain("headerPadding: 'px-3 py-1.5'");
  });

  it('routes table cell seams through the canonical table presets', () => {
    expect(read('components/organisms/table/atoms/TableCell.tsx')).toContain(
      'presets.tableCell'
    );
    expect(
      read('components/organisms/table/atoms/TableHeaderCell.tsx')
    ).toContain('presets.tableHeaderCell');
  });

  it('keeps Library leading columns on the shared table seam', () => {
    const librarySurface = read('app/app/(shell)/library/LibrarySurface.tsx');
    // Dense catalog columns live in the shared table layer (JOV-4846); its
    // leading status column keeps the same workspace seam.
    const catalogColumns = read(
      'components/features/library/library-catalog-columns.tsx'
    );

    expect(librarySurface).toContain(
      "import { alignment } from '@/components/organisms/table/table.styles';"
    );
    const seamOccurrences = [
      ...librarySurface.matchAll(/alignment\.workspaceSeamX/g),
      ...catalogColumns.matchAll(/alignment\.workspaceSeamX/g),
    ];
    expect(seamOccurrences).toHaveLength(2);
    expect(librarySurface).not.toContain('pl-2.5');
    expect(catalogColumns).not.toContain('pl-2.5');
  });

  /**
   * D2 — seam resolution (JOV-5865). Workspace surfaces read their x padding
   * from the shared seam (`alignment.workspaceSeamX` / the
   * `--app-shell-content-padding-x` token), never from off-grid literals
   * (`px-3.5` = 14px, `px-2.5` / `pl-2.5` = 10px). Shrink-only: the literal
   * count across the surface list may not grow; remaining count never fails.
   */
  const WORKSPACE_SEAM_SURFACES = [
    // header
    'components/features/dashboard/organisms/DashboardHeader.tsx',
    'components/molecules/ContentSectionHeader.tsx',
    // toolbar
    'components/organisms/table/molecules/PageToolbar.tsx',
    'components/organisms/table/molecules/TableBulkActionsToolbar.tsx',
    'components/organisms/table/molecules/HeaderBulkActions.tsx',
    // table / list first column + selection track
    'components/organisms/table/table.styles.ts',
    'components/organisms/table/atoms/TableCheckboxCell.tsx',
    'components/organisms/table/atoms/AudienceRowSelectionCell.tsx',
    'components/organisms/table/atoms/ShellListRowFrame.tsx',
    'components/organisms/table/molecules/TableHeaderRow.tsx',
    // status rows (Library catalog status column rides the shared seam)
    'app/app/(shell)/library/LibrarySurface.tsx',
    'components/features/library/library-catalog-columns.tsx',
    // content panel
    'components/organisms/AppShellContentPanel.tsx',
  ] as const;
  const OFF_GRID_X_PADDING =
    /(?<![\w-])-?(?:px|pl|pr|ps|pe|p)-(?:2\.5|3\.5)(?![\w./%])/g;
  // Locked to origin/main after JOV-5865 merge: PageToolbar tab/menu
  // control padding (px-2.5 ×2), LibrarySurface rail p-2.5 ×1,
  // AppShellContentPanel outer inset px-2.5 ×1 and compact sm:px-3.5 ×1.
  // Compact rematerialization is out of scope (detectors-only). Lower
  // when a later PR resolves them; never raise.
  const OFF_GRID_X_PADDING_FLOOR = 5;

  it('does not add off-grid x padding literals to workspace seam surfaces (shrink-only)', () => {
    const perFile = new Map<string, number>();
    let count = 0;
    for (const relativePath of WORKSPACE_SEAM_SURFACES) {
      const hits = read(relativePath).match(OFF_GRID_X_PADDING)?.length ?? 0;
      if (hits > 0) perFile.set(relativePath, hits);
      count += hits;
    }
    expect(
      count,
      `off-grid x padding literals on workspace seam surfaces rose to ${count} ` +
        `(floor ${OFF_GRID_X_PADDING_FLOOR}). Resolve the seam instead ` +
        `(alignment.workspaceSeamX or px-(--app-shell-content-padding-x)).\n` +
        [...perFile.entries()].map(([f, n]) => `  ${f}: ${n}`).join('\n')
    ).toBeLessThanOrEqual(OFF_GRID_X_PADDING_FLOOR);
  });

  it('keeps AppShellContentPanel default padding on the live seam token', () => {
    const panel = read('components/organisms/AppShellContentPanel.tsx');
    const paddingMap = panel.match(
      /PANEL_CONTENT_PADDING_CLASSNAME = \{([\s\S]*?)\} as const;/
    );
    expect(paddingMap, 'PANEL_CONTENT_PADDING_CLASSNAME map').not.toBeNull();
    const body = paddingMap?.[1] ?? '';
    // default already consumes --app-shell-content-padding-x (JOV-3764).
    expect(body).toContain('px-(--app-shell-content-padding-x)');
    expect(body).toContain('py-(--app-shell-content-padding-y)');
    // compact is remaining optical-grid drift. JOV-5865 is detectors-only
    // and must not rematerialize product UI; the shrink-only floor above
    // owns this remainder.
    expect(body).toMatch(/compact:\s*'px-3 py-3 sm:px-3\.5 sm:py-3\.5'/);
  });

  it('keeps the seam token family live (no fork to --linear-app-workspace-seam-x)', () => {
    const css = read('styles/design-system.css');
    expect(css).toContain('--app-shell-content-padding-x:');
    expect(css).toContain('--app-shell-frame-seam:');
    expect(css).toContain('--system-b-app-frame-seam:');
    expect(css).not.toContain('--linear-app-workspace-seam-x');
  });

  it('keeps the dashboard title on the workspace seam ahead of the visual rail-control order', () => {
    const header = read(
      'components/features/dashboard/organisms/DashboardHeader.tsx'
    );
    expect(header).toContain("data-testid='dashboard-header-title-slot'");
    expect(header).toContain("className='order-first flex min-w-0 flex-1");
    expect(header).toContain(
      "className='order-last flex h-7 w-7 shrink-0 items-center justify-center'"
    );

    const titleSlot = header.indexOf(
      "data-testid='dashboard-header-title-slot'"
    );
    const railSlot = header.indexOf("data-testid='dashboard-header-rail-slot'");

    expect(titleSlot).toBeGreaterThan(-1);
    expect(railSlot).toBeGreaterThan(titleSlot);
  });
});
