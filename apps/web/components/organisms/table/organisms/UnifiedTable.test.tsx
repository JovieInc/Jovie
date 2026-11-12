import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ColumnDef } from '@/lib/tanstack-table';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableEmptyState } from '../atoms/TableEmptyState';
import { UnifiedTable } from './UnifiedTable';

type CatalogRow = {
  readonly id: string;
  readonly title: string;
  readonly artist?: string;
};

const columns: ColumnDef<CatalogRow, unknown>[] = [
  { accessorKey: 'title', header: 'Title' },
  {
    accessorKey: 'artist',
    header: 'Artist',
    cell: ({ getValue }) => (getValue() as string | undefined) ?? null,
  },
];

const RELEASES: CatalogRow[] = [
  { id: 'one', title: 'Never Say A Word', artist: 'Tim White' },
  { id: 'two', title: 'Seaside Heights' },
];

function table(data: CatalogRow[], emptyState?: ReactNode) {
  return (
    <UnifiedTable
      data={data}
      columns={columns}
      enableVirtualization={false}
      getRowId={row => row.id}
      caption='Releases'
      emptyState={emptyState}
      onRowClick={vi.fn()}
    />
  );
}

describe('UnifiedTable states', () => {
  it('opens a row with missing values on click', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <UnifiedTable
        data={RELEASES}
        columns={columns}
        enableVirtualization={false}
        getRowId={row => row.id}
        onRowClick={onRowClick}
      />
    );

    await user.click(screen.getByRole('cell', { name: 'Seaside Heights' }));
    expect(onRowClick).toHaveBeenCalledWith(RELEASES[1]);
  });

  it('shows the caller empty state and runs its action when there are no rows', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      table(
        [],
        <TableEmptyState
          variant='error'
          heading='You are offline'
          action={{ label: 'Try Again', onClick: onRetry }}
        />
      )
    );

    expect(screen.getByRole('columnheader', { name: 'Title' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['rows with a missing value', table(RELEASES)],
    [
      'an empty state',
      table(
        [],
        <TableEmptyState
          heading='No releases yet'
          action={{ label: 'Add Release', onClick: () => undefined }}
        />
      ),
    ],
    [
      'an offline empty state',
      table([], <TableEmptyState variant='error' heading='You are offline' />),
    ],
    [
      'a permission empty state',
      table(
        [],
        <TableEmptyState
          variant='permission'
          heading='You do not have access to these releases'
        />
      ),
    ],
    [
      'long values',
      table([
        {
          id: 'long',
          title:
            'First Light (Extended Anniversary Remaster featuring The Midnight Orchestra)',
          artist:
            'The Extraordinarily Long Named Midnight Orchestra Collective',
        },
      ]),
    ],
    [
      'rtl rows',
      <div key='rtl' dir='rtl' lang='ar'>
        {table([{ id: 'ar', title: 'أول ضوء', artist: 'فرقة منتصف الليل' }])}
      </div>,
    ],
  ])('has no accessibility violations with %s', async (_name, ui) => {
    const { container } = render(ui);
    await expectNoA11yViolations(container);
  });
});
