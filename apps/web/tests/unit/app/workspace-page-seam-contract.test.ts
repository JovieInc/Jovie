import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = process.cwd();
const WORKSPACE_SEAM_CLASS = 'px-3';

function read(relativePath: string) {
  return readFileSync(join(WEB_ROOT, relativePath), 'utf8');
}

describe('workspace page optical seam contract', () => {
  it.each([
    'components/features/dashboard/organisms/DashboardHeader.tsx',
    'components/molecules/ContentSectionHeader.tsx',
    'components/organisms/table/molecules/PageToolbar.tsx',
    'components/organisms/table/table.styles.ts',
    'components/organisms/table/atoms/TableCell.tsx',
    'components/organisms/table/atoms/TableHeaderCell.tsx',
    'components/organisms/table/atoms/TableCheckboxCell.tsx',
    'app/app/(shell)/library/LibrarySurface.tsx',
  ])('%s uses the shared workspace seam', relativePath => {
    expect(read(relativePath)).toContain(WORKSPACE_SEAM_CLASS);
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
