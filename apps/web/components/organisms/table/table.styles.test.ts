import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  alignment,
  columnWidths,
  presets,
  rowState,
  selection,
} from './table.styles';

const TABLE_STYLE_SOURCE = readFileSync(
  join(process.cwd(), 'components/organisms/table/table.styles.ts'),
  'utf8'
);
const SHELL_LIST_ROW_SOURCE = readFileSync(
  join(process.cwd(), 'components/organisms/table/atoms/ShellListRowFrame.tsx'),
  'utf8'
);
const SKELETON_CELL_SOURCE = readFileSync(
  join(process.cwd(), 'components/organisms/table/atoms/SkeletonCell.tsx'),
  'utf8'
);

describe('table System B style exports', () => {
  it('routes table row states, sticky headers, and fixed sizing through named System B classes', () => {
    expect(alignment.rowHeight).toBe('system-b-table-row-height');
    expect(rowState.selected).toBe('system-b-table-row-selected');
    expect(rowState.focusVisible).toBe('system-b-table-row-focus-visible');
    expect(selection.checked).toBe('system-b-table-selection-checked');
    expect(columnWidths.small).toBe('system-b-table-column-small');
    expect(columnWidths.actions).toBe('system-b-table-column-actions');
    expect(presets.stickyHeader).toContain('system-b-table-sticky-header');
    expect(presets.tableRow).toContain('system-b-table-row-shell');
  });

  it('keeps shared table primitives free of local visual literals', () => {
    const source = [
      TABLE_STYLE_SOURCE,
      SHELL_LIST_ROW_SOURCE,
      SKELETON_CELL_SOURCE,
    ].join('\n');

    expect(source).not.toMatch(/\b(?:bg|shadow|ring|border|w|min-w|h)-\[/);
    expect(source).not.toMatch(/color-mix\(|rgba?\(|#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/group-(?:hover|focus-visible)\/task-row:bg-/);
  });
});
