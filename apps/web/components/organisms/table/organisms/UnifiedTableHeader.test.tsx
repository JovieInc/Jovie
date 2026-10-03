import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JsxEmit, ModuleKind, transpileModule } from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import {
  type ColumnDef,
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@/lib/tanstack-table';
import { TableHeaderCell } from '../molecules/TableHeaderCell';
import { presets } from '../table.styles';
import type { UnifiedTableHeader as HeaderComponent } from './UnifiedTableHeader';
import { UnifiedTableHeader } from './UnifiedTableHeader';

type Row = { id: string; title: string; count: number };

const columnHelper = createColumnHelper<Row>();

function Harness({
  onSortChange,
  initialSort,
  semanticOnlyActions = false,
  columnSnap = false,
}: {
  onSortChange?: () => void;
  initialSort?: { id: string; desc: boolean }[];
  semanticOnlyActions?: boolean;
  columnSnap?: boolean;
}) {
  const columns: ColumnDef<Row, any>[] = [
    columnHelper.accessor('title', {
      header: 'Title',
      enableSorting: true,
    }),
    columnHelper.accessor('count', {
      header: 'Count',
      enableSorting: true,
      meta: { align: 'right' },
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      meta: semanticOnlyActions ? { headerVisibility: 'sr-only' } : undefined,
    }),
  ];

  const table = useReactTable({
    data: [
      { id: '1', title: 'Alpha', count: 2 },
      { id: '2', title: 'Beta', count: 1 },
    ],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: initialSort ? { sorting: initialSort } : undefined,
    onSortingChange: onSortChange,
  });

  return (
    <table>
      <UnifiedTableHeader
        headerGroups={table.getHeaderGroups()}
        caption='Test table'
        columnSnap={columnSnap}
      />
    </table>
  );
}

describe('UnifiedTableHeader', () => {
  it('renders one column header per column definition', () => {
    render(<Harness />);
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Count')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('snaps header cells with the body when column snap is on', () => {
    render(<Harness columnSnap />);
    expect(screen.getAllByRole('columnheader')[0]).toHaveAttribute(
      'data-column-snap',
      'on'
    );
  });

  it('renders a screen reader caption when provided', () => {
    render(<Harness />);
    expect(screen.getByText('Test table')).toBeInTheDocument();
  });

  it('uses the canonical table header row density', () => {
    render(<Harness />);
    expect(screen.getByRole('row')).toHaveClass('h-8');
  });

  it('renders sortable columns as buttons', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: /Title/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Count/ })).toBeInTheDocument();
  });

  it('does not render a button for non-sortable columns', () => {
    render(<Harness />);
    expect(
      screen.queryByRole('button', { name: /Actions/ })
    ).not.toBeInTheDocument();
  });

  it('keeps icon-only headers semantic while removing visible label chrome', () => {
    render(<Harness semanticOnlyActions />);

    const actionsHeader = screen.getByText('Actions').closest('th');
    expect(actionsHeader).toBeInTheDocument();
    expect(screen.getByText('Actions')).toHaveClass('sr-only');
  });

  it('fires the sort handler when a sortable header is clicked', () => {
    const onSortChange = vi.fn();
    render(<Harness onSortChange={onSortChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Title/ }));
    expect(onSortChange).toHaveBeenCalled();
  });

  it('exposes aria-sort=ascending when sorted asc', () => {
    render(<Harness initialSort={[{ id: 'title', desc: false }]} />);
    const titleHeader = screen
      .getByRole('button', { name: /Title/ })
      .closest('th');
    expect(titleHeader).toHaveAttribute('aria-sort', 'ascending');
  });

  it('exposes aria-sort=descending when sorted desc', () => {
    render(<Harness initialSort={[{ id: 'title', desc: true }]} />);
    const titleHeader = screen
      .getByRole('button', { name: /Title/ })
      .closest('th');
    expect(titleHeader).toHaveAttribute('aria-sort', 'descending');
  });

  it('bakes sort state into the header button accessible name', () => {
    render(<Harness initialSort={[{ id: 'title', desc: true }]} />);
    expect(
      screen.getByRole('button', { name: 'Title: sorted descending' })
    ).toBeInTheDocument();
  });

  it('exposes aria-sort=none on sortable but unsorted columns', () => {
    render(<Harness />);
    const countHeader = screen
      .getByRole('button', { name: /Count/ })
      .closest('th');
    expect(countHeader).toHaveAttribute('aria-sort', 'none');
  });

  it('applies column meta alignment to sortable header chrome', () => {
    render(<Harness />);

    const countButton = screen.getByRole('button', { name: /Count/ });
    const countHeader = countButton.closest('th');
    expect(countHeader).toHaveClass('text-right');
    expect(countButton).toHaveClass('justify-end');
  });

  it('omits aria-sort on non-sortable columns', () => {
    render(<Harness />);
    const actionsHeader = screen.getByText('Actions').closest('th');
    expect(actionsHeader).not.toHaveAttribute('aria-sort');
  });

  it('returns null when headerGroups is empty', () => {
    const { container } = render(
      <table>
        <UnifiedTableHeader headerGroups={[]} />
      </table>
    );
    expect(container.querySelector('thead')).toBeNull();
  });
});

const require = createRequire(import.meta.url);
const babel = require('next/dist/compiled/babel/core') as {
  transformSync(
    code: string,
    options: Record<string, unknown>
  ): {
    code: string;
  };
};
const filename = path.join(__dirname, 'UnifiedTableHeader.tsx');
function compileHeader(removeOptOut = false) {
  const source = readFileSync(filename, 'utf8');
  const compiled = babel.transformSync(
    removeOptOut ? source.replace("  'use no memo';\n", '') : source,
    {
      filename,
      babelrc: false,
      configFile: false,
      plugins: [
        [require.resolve('babel-plugin-react-compiler'), {}],
        require.resolve('next/dist/compiled/babel/plugin-syntax-jsx'),
        [
          require.resolve('next/dist/compiled/babel/plugin-syntax-typescript'),
          { isTSX: true },
        ],
      ],
    }
  );
  const executable = transpileModule(compiled.code, {
    compilerOptions: { jsx: JsxEmit.ReactJSX, module: ModuleKind.CommonJS },
  }).outputText;
  const compiledModule = {
    exports: {} as { UnifiedTableHeader: typeof HeaderComponent },
  };
  // Execute the production compiler output with the real cell and table styles.
  const loadDependency = (id: string) => {
    if (id === '../molecules/TableHeaderCell') return { TableHeaderCell };
    if (id === '../table.styles') return { presets };
    return require(id);
  };
  new Function('require', 'module', 'exports', executable)(
    loadDependency,
    compiledModule,
    compiledModule.exports
  );
  return compiledModule.exports.UnifiedTableHeader;
}
const CompiledHeader = compileHeader();
const CachedHeader = compileHeader(true);

type Contact = { role: string };
const contacts: Contact[] = [
  { role: 'press' },
  { role: 'bookings' },
  { role: 'management' },
];
const columns: ColumnDef<Contact>[] = [{ accessorKey: 'role', header: 'Role' }];
function CompiledContacts({
  headerComponent: Header = CompiledHeader,
}: {
  headerComponent?: typeof HeaderComponent;
}) {
  const table = useReactTable({
    data: contacts,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  return (
    <table>
      <Header headerGroups={table.getHeaderGroups()} />
      <tbody>
        {table.getRowModel().rows.map(row => (
          <tr key={row.id}>
            <td>{row.original.role}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

describe('compiled table header sorting', () => {
  it('executes compiler caching in the negative control', async () => {
    const user = userEvent.setup();
    render(<CompiledContacts headerComponent={CachedHeader} />);
    const header = screen.getByRole('button', {
      name: 'Role: not sorted, activate to sort',
    });
    await user.click(header);
    expect(screen.getAllByRole('cell').map(cell => cell.textContent)).toEqual([
      'bookings',
      'management',
      'press',
    ]);
    expect(header).toHaveAccessibleName('Role: not sorted, activate to sort');
  });
  it('keeps accessible state and focus aligned with pointer and keyboard row sorting', async () => {
    const user = userEvent.setup();
    render(<CompiledContacts />);
    const header = screen.getByRole('button', {
      name: 'Role: not sorted, activate to sort',
    });
    await user.click(header);
    expect(screen.getAllByRole('cell').map(cell => cell.textContent)).toEqual([
      'bookings',
      'management',
      'press',
    ]);
    expect(header).toHaveAccessibleName('Role: sorted ascending');
    expect(screen.getByRole('columnheader')).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
    expect(header).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getAllByRole('cell').map(cell => cell.textContent)).toEqual([
      'press',
      'management',
      'bookings',
    ]);
    expect(header).toHaveAccessibleName('Role: sorted descending');
    expect(screen.getByRole('columnheader')).toHaveAttribute(
      'aria-sort',
      'descending'
    );
    await user.keyboard(' ');
    expect(screen.getAllByRole('cell').map(cell => cell.textContent)).toEqual([
      'press',
      'bookings',
      'management',
    ]);
    expect(header).toHaveAccessibleName('Role: not sorted, activate to sort');
    expect(screen.getByRole('columnheader')).toHaveAttribute(
      'aria-sort',
      'none'
    );
    expect(header).toHaveFocus();
  });
});
