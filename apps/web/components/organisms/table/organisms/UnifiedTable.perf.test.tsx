import { act, fireEvent, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ColumnDef } from '@/lib/tanstack-table';
import { COLUMN_SNAP_STAGGER_CAP } from '../column-snap';
import { TABLE_ROW_MODES } from '../table.styles';
import { UnifiedTable } from './UnifiedTable';
import { VIRTUALIZATION_INITIAL_VIEWPORT_PX } from './useTableVirtualization';

/**
 * Perf budget for the canonical table (one system for every app table).
 * 10k rows must render a bounded window, a j/k keystroke must re-render only
 * the two rows whose focus changed, and a scroll step must not re-render the
 * whole window. Render counts are deterministic. The timing check takes the
 * fastest of ten keystrokes against the 16ms frame budget: machine load only
 * slows samples down, so the fastest one still shows a regression in the work
 * a keystroke does (re-rendering the window costs far more than 16ms).
 */

const ROW_COUNT = 10_000;
const VIEWPORT_PX = 640;
const OVERSCAN = 5;
const ROW_PX = TABLE_ROW_MODES.dense.rowHeight;
const FRAME_BUDGET_MS = 16;

type PerfRow = { id: string; name: string };

const data: PerfRow[] = Array.from({ length: ROW_COUNT }, (_, index) => ({
  id: `row-${index}`,
  name: `Person ${index}`,
}));

let cellRenders = 0;
const columns: ColumnDef<PerfRow, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ getValue }) => {
      cellRenders += 1;
      return getValue() as string;
    },
  },
];

const maxWindowRows = (viewport: number) =>
  Math.ceil(viewport / ROW_PX) + OVERSCAN * 2 + 1;

function bodyRows(container: HTMLElement) {
  return container.querySelectorAll('tbody tr[data-index]');
}

describe('UnifiedTable perf budget (10k rows)', () => {
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetHeight'
  );
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetWidth'
  );

  beforeAll(() => {
    // jsdom has no layout: rows measure at the dense height, everything else
    // (the scroll container) at the viewport height.
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.tagName === 'TR' ? ROW_PX : VIEWPORT_PX;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get: () => 1024,
    });
    HTMLElement.prototype.scrollIntoView = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  });

  afterAll(() => {
    if (originalOffsetHeight) {
      Object.defineProperty(
        HTMLElement.prototype,
        'offsetHeight',
        originalOffsetHeight
      );
    }
    if (originalOffsetWidth) {
      Object.defineProperty(
        HTMLElement.prototype,
        'offsetWidth',
        originalOffsetWidth
      );
    }
  });

  it('server-renders a bounded window instead of every row', () => {
    const html = renderToString(
      <UnifiedTable
        data={data}
        columns={columns}
        rowMode='dense'
        overscan={OVERSCAN}
        getRowId={row => row.id}
      />
    );

    const rendered = html.match(/data-index="/g)?.length ?? 0;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThanOrEqual(
      maxWindowRows(VIRTUALIZATION_INITIAL_VIEWPORT_PX)
    );
  });

  it('renders only the visible window and keeps j/k and scroll cheap', () => {
    const onRowClick = vi.fn();
    const { container } = render(
      <UnifiedTable
        data={data}
        columns={columns}
        rowMode='dense'
        overscan={OVERSCAN}
        getRowId={row => row.id}
        onRowClick={onRowClick}
      />
    );

    const initialRows = bodyRows(container);
    expect(initialRows.length).toBeGreaterThan(0);
    expect(initialRows.length).toBeLessThanOrEqual(maxWindowRows(VIEWPORT_PX));

    // j/k: only the row losing focus and the row gaining it re-render.
    const durations: number[] = [];
    for (let step = 0; step < 10; step += 1) {
      const focused = container.querySelector<HTMLElement>(
        `tbody tr[data-index="${step}"]`
      );
      expect(focused).not.toBeNull();
      cellRenders = 0;
      const start = performance.now();
      fireEvent.keyDown(focused as HTMLElement, { key: 'j' });
      durations.push(performance.now() - start);
      expect(cellRenders).toBeLessThanOrEqual(2);
    }
    expect(Math.min(...durations)).toBeLessThan(FRAME_BUDGET_MS);

    // Scroll: jump far, then step three rows. Rows entering the window render,
    // plus at most the column-snap stagger slots at its top; every other row
    // that merely shifts position stays memoized.
    const scroller = container.firstElementChild as HTMLElement | null;
    expect(scroller).not.toBeNull();
    const scrollTo = (row: number) =>
      act(() => {
        (scroller as HTMLElement).scrollTop = ROW_PX * row;
        fireEvent.scroll(scroller as HTMLElement);
      });
    const windowIndexes = () =>
      [...bodyRows(container)].map(row => row.getAttribute('data-index'));

    scrollTo(200);
    expect(windowIndexes()).toContain('200');
    expect(windowIndexes().length).toBeLessThanOrEqual(
      maxWindowRows(VIEWPORT_PX)
    );

    const before = new Set(windowIndexes());
    cellRenders = 0;
    scrollTo(203);
    const after = windowIndexes();
    const entered = after.filter(index => !before.has(index)).length;
    expect(entered).toBeGreaterThan(0);
    expect(after.length).toBeLessThanOrEqual(maxWindowRows(VIEWPORT_PX));
    expect(cellRenders).toBeLessThanOrEqual(entered + COLUMN_SNAP_STAGGER_CAP);
  });
});
