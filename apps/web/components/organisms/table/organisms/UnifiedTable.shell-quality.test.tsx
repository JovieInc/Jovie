import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ColumnDef,
  RowSelectionState,
  Updater,
} from '@/lib/tanstack-table';
import { UnifiedTable } from './UnifiedTable';

const qa = vi.hoisted(() => ({ scroll: vi.fn() }));
vi.mock('./useTableVirtualization', () => ({
  useTableVirtualization: ({
    enabled,
    rowCount,
  }: {
    enabled: boolean;
    rowCount: number;
  }) => {
    const [index, setIndex] = useState(0);
    return {
      virtualizer: {
        measureElement: vi.fn(),
        scrollToIndex: (next: number) => {
          qa.scroll(next);
          setIndex(next);
        },
      },
      virtualRows:
        enabled && rowCount > 0
          ? [
              {
                index,
                start: index * 56,
                size: 56,
                end: (index + 1) * 56,
                key: index,
                lane: 0,
              },
            ]
          : [],
      paddingTop: enabled ? index * 56 : 0,
      paddingBottom: enabled ? Math.max(0, rowCount - index - 1) * 56 : 0,
    };
  },
}));

type Row = { id: string; name: string; group: string };
const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
];
const rows: Row[] = Array.from({ length: 30 }, (_, index) => ({
  id: String(index),
  name: `Row ${index}`,
  group: index < 15 ? 'First' : 'Second',
}));
const groups = {
  getGroupKey: (row: Row) => row.group,
  getGroupLabel: (key: string) => key,
};
let observations: {
  callback: IntersectionObserverCallback;
  targets: Element[];
  observer: IntersectionObserver;
}[];
let originalRect: typeof Element.prototype.getBoundingClientRect;

beforeEach(() => {
  qa.scroll.mockReset();
  observations = [];
  originalRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 400,
      bottom: this.tagName === 'THEAD' ? 40 : 0,
      width: 400,
      height: this.tagName === 'THEAD' ? 40 : 0,
      toJSON: () => ({}),
    };
  };
  HTMLElement.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        observations.push({
          callback,
          targets: [],
          observer: this as unknown as IntersectionObserver,
        });
      }
      observe(target: Element) {
        observations
          .find(
            item => item.observer === (this as unknown as IntersectionObserver)
          )
          ?.targets.push(target);
      }
      disconnect() {}
      unobserve() {}
    }
  );
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = originalRect;
  vi.unstubAllGlobals();
});

function intersect(target: Element) {
  const observation = observations.findLast(item =>
    item.targets.includes(target)
  );
  expect(observation).toBeDefined();
  act(() =>
    observation?.callback(
      [{ target, isIntersecting: true } as IntersectionObserverEntry],
      observation.observer
    )
  );
}

describe.each(['creator', 'company'])('%s shared table lifecycle', target => {
  it('keeps grouped pagination reachable and loading status inside the table', () => {
    const load = vi.fn();
    const { container, rerender } = render(
      <UnifiedTable
        caption={target}
        data={rows}
        columns={columns}
        groupingConfig={groups}
        enableVirtualization={false}
        onLoadMore={load}
        hasNextPage
      />
    );
    const sentinel = container.querySelector('[data-table-load-more]');
    expect(sentinel).not.toBeNull();
    intersect(sentinel as Element);
    intersect(sentinel as Element);
    expect(load).toHaveBeenCalledOnce();
    rerender(
      <UnifiedTable
        caption={target}
        data={rows}
        columns={columns}
        groupingConfig={groups}
        enableVirtualization={false}
        onLoadMore={load}
        hasNextPage
        isFetchingNextPage
      />
    );
    expect(
      screen.getByRole('status', { name: 'Loading More' })
    ).toBeInTheDocument();
    intersect(container.querySelector('[data-table-load-more]') as Element);
    expect(load).toHaveBeenCalledOnce();
  });
  it('observes pagination after an empty state becomes grouped data', () => {
    const load = vi.fn();
    const { container, rerender } = render(
      <UnifiedTable
        data={[]}
        columns={columns}
        emptyState={<p>No rows</p>}
        onLoadMore={load}
        hasNextPage
      />
    );
    rerender(
      <UnifiedTable
        data={rows}
        columns={columns}
        groupingConfig={groups}
        enableVirtualization={false}
        onLoadMore={load}
        hasNextPage
      />
    );
    const sentinel = container.querySelector('[data-table-load-more]');
    expect(sentinel).not.toBeNull();
    intersect(sentinel as Element);
    expect(load).toHaveBeenCalledOnce();
  });
  it('offsets sticky group headers by the actual column-header height, then resets when hidden', () => {
    const { container, rerender } = render(
      <UnifiedTable
        data={rows}
        columns={columns}
        groupingConfig={groups}
        enableVirtualization={false}
      />
    );
    expect(container.querySelector('[data-group-key="First"]')).toHaveStyle({
      top: '40px',
    });
    rerender(
      <UnifiedTable
        data={rows}
        columns={columns}
        groupingConfig={groups}
        enableVirtualization={false}
        hideHeader
      />
    );
    expect(container.querySelector('[data-group-key="First"]')).toHaveStyle({
      top: '0px',
    });
  });
  it('selects the displayed grouped row when source groups are interleaved', () => {
    const onToggleRowSelection = vi.fn();
    const interleaved = [rows[0], rows[15], rows[1]];
    render(
      <UnifiedTable
        caption={target}
        data={interleaved}
        columns={columns}
        groupingConfig={groups}
        enableVirtualization={false}
        enableKeyboardNavigation
        getRowTestId={row => `${target}-${row.id}`}
        onToggleRowSelection={onToggleRowSelection}
      />
    );
    fireEvent.keyDown(screen.getByTestId(`${target}-1`), { key: 'x' });
    expect(onToggleRowSelection).toHaveBeenCalledWith(rows[1], 1);
  });

  it('moves actual focus to unmounted End and Home destinations after virtual scrolling', () => {
    render(
      <UnifiedTable
        caption={target}
        data={rows}
        columns={columns}
        enableVirtualization
        onRowClick={vi.fn()}
        getRowTestId={row => `${target}-${row.id}`}
      />
    );
    const first = screen.getByTestId(`${target}-0`);
    first.focus();
    fireEvent.keyDown(first, { key: 'End' });
    expect(qa.scroll).toHaveBeenCalledWith(29);
    const last = screen.getByTestId(`${target}-29`);
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Home' });
    expect(screen.getByTestId(`${target}-0`)).toHaveFocus();
  });

  it('preserves distinct table identities when grouped rows share an original object', () => {
    const selection = vi.fn<(update: Updater<RowSelectionState>) => void>();
    render(
      <UnifiedTable
        data={[rows[0], rows[0]]}
        columns={columns}
        groupingConfig={groups}
        enableVirtualization={false}
        enableKeyboardNavigation
        rowSelection={{}}
        onRowSelectionChange={selection}
        getRowTestId={(_, index) => `${target}-position-${index}`}
      />
    );
    fireEvent.keyDown(screen.getByTestId(`${target}-position-0`), { key: 'x' });
    const update = selection.mock.calls[0]?.[0];
    expect(typeof update).toBe('function');
    expect(typeof update === 'function' ? update({}) : update).toEqual({
      '0': true,
    });
  });
});
