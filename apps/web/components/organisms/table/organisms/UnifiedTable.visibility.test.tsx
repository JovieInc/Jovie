import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ColumnDef } from '@/lib/tanstack-table';
import { UnifiedTable } from './UnifiedTable';

const data = [
  { id: 'fan', name: 'Fan', engagement: 'High', lastSeen: 'Today' },
];
const columns: ColumnDef<(typeof data)[number], unknown>[] = [
  { accessorKey: 'name', header: 'Fan' },
  { accessorKey: 'engagement', header: 'Engagement' },
  { accessorKey: 'lastSeen', header: 'Last Seen' },
];

describe('UnifiedTable responsive columns', () => {
  it.each([false, true])(
    'keeps body cells aligned when columns change (grouped: %s)',
    grouped => {
      const props = {
        data,
        columns,
        enableVirtualization: false,
        groupingConfig: grouped
          ? { getGroupKey: () => 'fans', getGroupLabel: () => 'Fans' }
          : undefined,
      };
      const { rerender } = render(<UnifiedTable {...props} />);
      const cells = () =>
        within(
          screen.getByRole('cell', { name: 'Fan', exact: true }).closest('tr')!
        )
          .getAllByRole('cell')
          .map(cell => cell.textContent);

      expect(cells()).toEqual(['Fan', 'High', 'Today']);
      rerender(
        <UnifiedTable {...props} columnVisibility={{ engagement: false }} />
      );
      expect(screen.getAllByRole('columnheader')).toHaveLength(2);
      expect(cells()).toEqual(['Fan', 'Today']);

      rerender(
        <UnifiedTable {...props} columnVisibility={{ engagement: true }} />
      );
      expect(screen.getAllByRole('columnheader')).toHaveLength(3);
      expect(cells()).toEqual(['Fan', 'High', 'Today']);
    }
  );
});
