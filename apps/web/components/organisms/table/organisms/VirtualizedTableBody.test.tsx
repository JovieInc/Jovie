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
import { VirtualizedTableBody } from './VirtualizedTableBody';

type Release = { readonly id: string; readonly title: string };

const column = createColumnHelper<Release>();
// TanStack column arrays mix value types, so the value slot is any.
const columns: ColumnDef<Release, any>[] = [
  column.accessor('title', { header: 'Title' }),
];

const RELEASES: Release[] = [
  { id: 'one', title: 'Never Say A Word' },
  { id: 'two', title: 'Seaside Heights' },
];

type BodyProps = Omit<
  ComponentProps<typeof VirtualizedTableBody<Release>>,
  | 'rows'
  | 'rowRefsMap'
  | 'shouldVirtualize'
  | 'shouldEnableKeyboardNav'
  | 'focusedIndex'
  | 'onFocusChange'
  | 'onKeyDown'
  | 'columnCount'
> &
  Partial<
    Pick<
      ComponentProps<typeof VirtualizedTableBody<Release>>,
      'onFocusChange' | 'onKeyDown'
    >
  >;

function Body({
  data,
  dir,
  ...props
}: BodyProps & { readonly data: Release[]; readonly dir?: 'rtl' }) {
  const table = useReactTable({
    data,
    columns,
    getRowId: row => row.id,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <table dir={dir} lang={dir === 'rtl' ? 'ar' : 'en'}>
      <caption>Releases</caption>
      <VirtualizedTableBody
        rows={table.getRowModel().rows}
        shouldVirtualize={false}
        rowRefsMap={new Map()}
        shouldEnableKeyboardNav
        focusedIndex={0}
        onFocusChange={vi.fn()}
        onKeyDown={vi.fn()}
        columnCount={1}
        {...props}
      />
    </table>
  );
}

describe('VirtualizedTableBody (colocated)', () => {
  it('selects a row on click and extends a range on shift-click', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const onRowShiftClick = vi.fn();
    render(
      <Body
        data={RELEASES}
        onRowClick={onRowClick}
        onRowShiftClick={onRowShiftClick}
      />
    );

    await user.click(screen.getByRole('cell', { name: 'Never Say A Word' }));
    expect(onRowClick).toHaveBeenCalledWith(RELEASES[0]);

    fireEvent.click(screen.getByRole('cell', { name: 'Seaside Heights' }), {
      shiftKey: true,
    });
    expect(onRowShiftClick).toHaveBeenCalledWith(1, RELEASES[1]);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it('hands row keys to the keyboard handler with the row data', () => {
    const onKeyDown = vi.fn();
    render(<Body data={RELEASES} onKeyDown={onKeyDown} />);

    const [first] = screen.getAllByRole('row');
    expect(first).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(first, { key: 'j' });
    expect(onKeyDown).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'j' }),
      0,
      RELEASES[0]
    );
  });

  it('renders the expanded content under its row', () => {
    render(
      <Body
        data={RELEASES}
        expandedRowIds={new Set(['two'])}
        renderExpandedContent={row => <p>Tracks for {row.title}</p>}
      />
    );

    const rows = screen.getAllByRole('row');
    expect(rows.map(row => row.textContent)).toEqual([
      'Never Say A Word',
      'Seaside Heights',
      'Tracks for Seaside Heights',
    ]);
  });

  it('renders an empty body when there are no rows', () => {
    const { container } = render(<Body data={[]} />);

    expect(container.querySelector('tbody')).toBeEmptyDOMElement();
  });

  it.each([
    ['rows', RELEASES, undefined],
    ['no rows', [], undefined],
    ['rtl rows', [{ id: 'ar', title: 'أول ضوء' }], 'rtl'],
  ] as const)(
    'has no accessibility violations with %s',
    async (_name, data, dir) => {
      const { container } = render(
        <Body data={[...data]} dir={dir} onRowClick={vi.fn()} />
      );
      await expectNoA11yViolations(container);
    }
  );
});
