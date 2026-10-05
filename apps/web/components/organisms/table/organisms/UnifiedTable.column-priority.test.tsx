import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
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
  it('preserves server-rendered cells and focus when hydration enables motion', async () => {
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: false,
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const table = (
      <UnifiedTable
        data={rows}
        columns={columns}
        enableVirtualization={false}
        getRowId={row => row.id}
        minWidth='0'
      />
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(table);
    document.body.append(container);
    const header = container.querySelector('th');
    const cell = container.querySelector('td');
    const button = container.querySelector('button');
    expect(header).not.toBeNull();
    expect(cell).not.toBeNull();
    expect(button).not.toBeNull();
    button?.focus();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, table);
      });
      await waitFor(() =>
        expect(
          container.querySelector('[data-column-snap="on"]')
        ).not.toBeNull()
      );
      expect(container.querySelector('th')).toBe(header);
      expect(container.querySelector('td')).toBe(cell);
      expect(container.querySelector('button')).toBe(button);
      expect(document.activeElement).toBe(button);
    } finally {
      await act(async () => root?.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
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

  it('snaps painted cells, and stays still when snap is off or motion is reduced', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { unmount } = render(
      <UnifiedTable
        data={rows}
        columns={columns}
        enableVirtualization={false}
        getRowId={row => row.id}
        minWidth='0'
      />
    );
    await waitFor(() => {
      expect(document.querySelector('[data-column-snap="on"]')).not.toBeNull();
    });
    expect(
      document.querySelector('[data-column-snap-order="0"]')
    ).not.toBeNull();
    unmount();

    render(
      <UnifiedTable
        data={rows}
        columns={columns}
        columnSnap={false}
        enableVirtualization={false}
        getRowId={row => row.id}
        minWidth='0'
      />
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.querySelector('[data-column-snap="on"]')).toBeNull();

    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const reduced = render(
      <UnifiedTable
        data={rows}
        columns={columns}
        enableVirtualization={false}
        getRowId={row => row.id}
        minWidth='0'
      />
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.querySelector('[data-column-snap="on"]')).toBeNull();
    reduced.unmount();
    vi.unstubAllGlobals();
  });

  it('plays on Space and opens on Enter when a row toggle is given', () => {
    const onRowClick = vi.fn();
    const onRowToggle = vi.fn();
    render(
      <UnifiedTable
        data={rows}
        columns={columns}
        enableVirtualization={false}
        getRowId={row => row.id}
        getRowTestId={row => `demo-row-${row.id}`}
        onRowClick={onRowClick}
        onRowToggle={onRowToggle}
        minWidth='0'
      />
    );
    const row = screen.getByTestId('demo-row-1');

    fireEvent.keyDown(row, { key: ' ' });
    expect(onRowToggle).toHaveBeenCalledWith(rows[0]);
    expect(onRowClick).not.toHaveBeenCalled();

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });
});
