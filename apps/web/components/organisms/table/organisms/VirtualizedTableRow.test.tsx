import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  type ColumnDef,
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@/lib/tanstack-table';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { VirtualizedTableRow } from './VirtualizedTableRow';

type Release = {
  readonly id: string;
  readonly title: string;
  readonly artist?: string;
};

const column = createColumnHelper<Release>();
// TanStack column arrays mix value types, so the value slot is any.
const columns: ColumnDef<Release, any>[] = [
  column.accessor('title', { header: 'Title' }),
  column.accessor('artist', {
    header: 'Artist',
    cell: info => info.getValue() ?? null,
  }),
];

type RowProps = Partial<
  Omit<ComponentProps<typeof VirtualizedTableRow<Release>>, 'row'>
>;

function ReleaseRow({
  release,
  dir,
  ...props
}: RowProps & { readonly release: Release; readonly dir?: 'rtl' }) {
  const table = useReactTable({
    data: [release],
    columns,
    getRowId: row => row.id,
    getCoreRowModel: getCoreRowModel(),
  });
  const [row] = table.getRowModel().rows;
  return (
    <table dir={dir} lang={dir === 'rtl' ? 'ar' : 'en'}>
      <caption>Releases</caption>
      <tbody>
        <VirtualizedTableRow
          row={row}
          rowIndex={3}
          rowRefsMap={new Map()}
          shouldEnableKeyboardNav
          shouldVirtualize={false}
          isFocused
          onKeyDown={vi.fn()}
          onFocusChange={vi.fn()}
          {...props}
        />
      </tbody>
    </table>
  );
}

const RELEASE: Release = {
  id: 'r1',
  title: 'First Light',
  artist: 'Midnight Orchestra',
};

describe('VirtualizedTableRow (colocated)', () => {
  it('opens the row on click and ranges on shift-click', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const onRowShiftClick = vi.fn();
    render(
      <ReleaseRow
        release={RELEASE}
        onRowClick={onRowClick}
        onRowShiftClick={onRowShiftClick}
      />
    );

    const row = screen.getByRole('row');
    await user.click(row);
    expect(onRowClick).toHaveBeenCalledWith(RELEASE);
    fireEvent.click(row, { shiftKey: true });
    expect(onRowShiftClick).toHaveBeenCalledWith(3, RELEASE);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it('focuses and opens the row before its context actions', () => {
    const onRowClick = vi.fn();
    const onFocusChange = vi.fn();
    const onRowContextMenu = vi.fn();
    render(
      <ReleaseRow
        release={RELEASE}
        onRowClick={onRowClick}
        onFocusChange={onFocusChange}
        onRowContextMenu={onRowContextMenu}
      />
    );

    fireEvent.contextMenu(screen.getByRole('row'));
    expect(onRowClick).toHaveBeenCalledWith(RELEASE);
    expect(onFocusChange).toHaveBeenCalledWith(3);
    expect(onRowContextMenu).toHaveBeenCalledWith(
      RELEASE,
      expect.objectContaining({ type: 'contextmenu' })
    );
  });

  it('passes row keys to the keyboard handler and owns the roving tab stop', () => {
    const onKeyDown = vi.fn();
    render(<ReleaseRow release={RELEASE} onKeyDown={onKeyDown} />);

    const row = screen.getByRole('row');
    expect(row).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onKeyDown).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'Enter' }),
      3,
      RELEASE
    );
  });

  it('keeps a cell for a missing value so the row keeps its columns', () => {
    render(<ReleaseRow release={{ id: 'r2', title: 'Untitled Demo' }} />);

    const cells = screen.getAllByRole('cell');
    expect(cells).toHaveLength(2);
    expect(cells[1]).toHaveTextContent('');
  });

  it.each([
    ['a full row', RELEASE, undefined],
    ['a missing artist', { id: 'r2', title: 'Untitled Demo' }, undefined],
    [
      'long values',
      {
        id: 'r3',
        title:
          'First Light (Extended Anniversary Remaster featuring The Midnight Orchestra)',
        artist: 'The Extraordinarily Long Named Midnight Orchestra Collective',
      },
      undefined,
    ],
    ['rtl', { id: 'r4', title: 'أول ضوء', artist: 'فرقة منتصف الليل' }, 'rtl'],
  ] as const)(
    'has no accessibility violations with %s',
    async (_name, release, dir) => {
      const { container } = render(
        <ReleaseRow release={release} dir={dir} onRowClick={vi.fn()} />
      );
      await expectNoA11yViolations(container);
    }
  );
});
