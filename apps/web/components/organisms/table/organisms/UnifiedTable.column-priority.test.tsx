import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ColumnDef } from '@/lib/tanstack-table';
import { UnifiedTable } from './UnifiedTable';

interface DemoRow {
  readonly id: string;
  readonly fan: string;
  readonly state: string;
  readonly alerts: string;
}

const columns: ColumnDef<DemoRow, unknown>[] = [
  {
    accessorKey: 'fan',
    header: 'Fan',
    size: 9999,
    meta: { primary: true, minWidth: 200 },
  },
  {
    id: 'state',
    header: 'State',
    accessorFn: row => row.state,
    size: 96,
    meta: {
      priority: 2,
      minWidth: 200,
      compact: row => row.state,
    },
  },
  {
    id: 'alerts',
    header: 'Alerts',
    accessorFn: row => row.alerts,
    size: 96,
    meta: {
      priority: 1,
      minWidth: 200,
      compact: row => row.alerts,
    },
  },
];

const rows: DemoRow[] = [
  { id: '1', fan: 'Avery Chen', state: 'Active', alerts: 'SMS' },
];

function installObserver() {
  let callback: ResizeObserverCallback | null = null;
  vi.stubGlobal(
    'ResizeObserver',
    class MockResizeObserver {
      constructor(next: ResizeObserverCallback) {
        callback = next;
      }

      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
  );
  return (width: number) => {
    act(() => {
      callback?.(
        [{ contentRect: { width } } as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });
  };
}

describe('UnifiedTable column priority', () => {
  it('folds hidden columns into the primary cell and stretches the rest back', () => {
    const resize = installObserver();
    render(
      <UnifiedTable
        data={rows}
        columns={columns}
        enableVirtualization={false}
        getRowId={row => row.id}
        minWidth='0'
      />
    );

    expect(
      screen.getByRole('columnheader', { name: 'State' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Alerts' })
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('table-column-compacts')
    ).not.toBeInTheDocument();

    resize(500);
    expect(
      screen.queryByRole('columnheader', { name: 'Alerts' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'State' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('table-column-compacts')).toHaveTextContent(
      'SMS'
    );
    expect(screen.getByRole('cell', { name: /Avery Chen/ })).toHaveTextContent(
      'Avery Chen'
    );

    resize(300);
    expect(
      screen.queryByRole('columnheader', { name: 'State' })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('table-column-compacts')).toHaveTextContent(
      'Active'
    );
    expect(screen.getByTestId('table-column-compacts')).toHaveTextContent(
      'SMS'
    );

    vi.unstubAllGlobals();
  });

  it('keeps a caller from forcing a column back on when it does not fit', () => {
    const resize = installObserver();
    render(
      <UnifiedTable
        data={rows}
        columns={columns}
        columnVisibility={{ alerts: true }}
        enableVirtualization={false}
        getRowId={row => row.id}
        minWidth='0'
      />
    );

    resize(500);
    expect(
      screen.queryByRole('columnheader', { name: 'Alerts' })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('table-column-compacts')).toHaveTextContent(
      'SMS'
    );
    vi.unstubAllGlobals();
  });
});
