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
 * whole window. Every assertion is a render count or a DOM fact, so the
 * budget holds on any machine: a regression that re-renders the window on a
 * keystroke shows up as cell renders, not as wall-clock milliseconds. (A 16ms
 * wall-clock check here failed merge groups under runner load, 17.38ms on
 * 2026-10-12, while every render count passed.)
 */

const ROW_COUNT = 10_000;
const VIEWPORT_PX = 640;
const OVERSCAN = 5;
const ROW_PX = TABLE_ROW_MODES.dense.rowHeight;

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

// jsdom has no layout. TanStack virtual-core <= 3.19.4 measured the scroll
// element with offsetWidth/offsetHeight; 3.19.6 (react-virtual 3.14.21) reads
// clientWidth/clientHeight. Stub both so the viewport is known whichever the
// library reads; otherwise it sees a 0px viewport, yields no rows, and the body
// falls back to all 10k (#22280 merge group, 2026-10-20).
const LAYOUT_PROPS = [
  'offsetHeight',
  'offsetWidth',
  'clientHeight',
  'clientWidth',
] as const;

describe('UnifiedTable perf budget (10k rows)', () => {
  // Own descriptors only: clientHeight/clientWidth live on Element.prototype,
  // so the stub is deleted afterwards rather than copied onto HTMLElement.
  const originals = LAYOUT_PROPS.map(
    prop =>
      [
        prop,
        Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop),
      ] as const
  );

  beforeAll(() => {
    // Rows measure at the dense height, everything else (the scroll
    // container) at the viewport height.
    for (const prop of ['offsetHeight', 'clientHeight'] as const) {
      Object.defineProperty(HTMLElement.prototype, prop, {
        configurable: true,
        get(this: HTMLElement) {
          return this.tagName === 'TR' ? ROW_PX : VIEWPORT_PX;
        },
      });
    }
    for (const prop of ['offsetWidth', 'clientWidth'] as const) {
      Object.defineProperty(HTMLElement.prototype, prop, {
        configurable: true,
        get: () => 1024,
      });
    }
    HTMLElement.prototype.scrollIntoView = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  });

  afterAll(() => {
    for (const [prop, descriptor] of originals) {
      if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, prop, descriptor);
      } else {
        delete (HTMLElement.prototype as unknown as Record<string, unknown>)[
          prop
        ];
      }
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

    // j/k: only the row losing focus and the row gaining it re-render, and
    // focus really moves one row per keystroke.
    const row = (index: number) =>
      container.querySelector<HTMLElement>(`tbody tr[data-index="${index}"]`);
    for (let step = 0; step < 10; step += 1) {
      const focused = row(step);
      expect(focused).not.toBeNull();
      cellRenders = 0;
      fireEvent.keyDown(focused as HTMLElement, { key: 'j' });
      expect(cellRenders).toBeLessThanOrEqual(2);
      expect(row(step + 1)?.tabIndex).toBe(0);
      expect(row(step)?.tabIndex).toBe(-1);
    }
    expect(bodyRows(container).length).toBeLessThanOrEqual(
      maxWindowRows(VIEWPORT_PX)
    );

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
