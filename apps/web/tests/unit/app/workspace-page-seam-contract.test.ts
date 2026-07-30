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
});
