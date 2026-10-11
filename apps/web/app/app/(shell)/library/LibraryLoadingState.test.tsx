import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIBRARY_LIFECYCLE_STAGES } from '@/lib/library/lifecycle-stage';
import {
  LIBRARY_CATALOG_SKELETON_COLUMNS,
  LIBRARY_STAGE_CHIP_KEYS,
  LIBRARY_TABLE_SKELETON_COLUMNS,
  LibraryLoadingState,
} from './LibraryLoadingState';
import {
  LIBRARY_CATALOG_SCAN_COLUMNS,
  LIBRARY_TABLE_COLUMNS,
} from './LibrarySurface';

function geometry(
  columns: readonly {
    readonly id?: string;
    readonly header?: unknown;
    readonly size?: number;
    readonly minSize?: number;
    readonly meta?: unknown;
  }[]
) {
  return columns.map(({ id, header, size, minSize, meta }) => ({
    id,
    header,
    size,
    minSize,
    meta:
      meta && typeof meta === 'object'
        ? Object.fromEntries(
            Object.entries(meta as Record<string, unknown>).filter(
              ([, value]) => typeof value !== 'function'
            )
          )
        : meta,
  }));
}

describe('LibraryLoadingState', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps placeholder cells aligned with headers when the inspector narrows the table', async () => {
    let width = 532;
    vi.stubGlobal('ResizeObserver', undefined);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({
        width,
        height: 900,
        top: 0,
        left: 0,
        right: width,
        bottom: 900,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })
    );
    render(<LibraryLoadingState />);
    const table = screen.getByRole('table', { name: 'Loading table data' });
    const assertColumnCount = (expected: number) => {
      expect(within(table).getAllByRole('columnheader')).toHaveLength(expected);
      const rows = table.querySelectorAll('tbody tr');
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows)
        expect(within(row as HTMLElement).getAllByRole('cell')).toHaveLength(
          expected
        );
    };
    expect(screen.getByTestId('library-surface-loading')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(
      within(table).queryByRole('columnheader', { name: 'Artist' })
    ).not.toBeInTheDocument();
    assertColumnCount(5);
    await act(async () => {
      width = 1000;
      globalThis.dispatchEvent(new Event('resize'));
    });
    expect(
      within(table).getByRole('columnheader', { name: 'Artist' })
    ).toBeInTheDocument();
    assertColumnCount(7);
  });
  it('matches the loaded Library table geometry so the swap cannot shift', () => {
    expect(geometry(LIBRARY_TABLE_SKELETON_COLUMNS)).toEqual(
      geometry(LIBRARY_TABLE_COLUMNS)
    );
  });

  it('matches the dense default catalog geometry', () => {
    expect(geometry(LIBRARY_CATALOG_SKELETON_COLUMNS)).toEqual(
      geometry(LIBRARY_CATALOG_SCAN_COLUMNS)
    );
  });

  it('reserves one filter chip per visible Library stage', () => {
    expect(LIBRARY_STAGE_CHIP_KEYS).toEqual([
      'all',
      ...LIBRARY_LIFECYCLE_STAGES,
    ]);
  });

  it('stays out of the Library feature module graph', () => {
    // The app shell layout renders this skeleton on every /app route. If it
    // imports LibrarySurface, the whole Library feature ships everywhere.
    const source = readFileSync(
      join(__dirname, 'LibraryLoadingState.tsx'),
      'utf8'
    );
    expect(source).not.toMatch(/from '\.\/LibrarySurface'/);
    expect(source).not.toMatch(/from '@\/components\/organisms\/table'/);

    const layout = readFileSync(join(__dirname, '..', 'layout.tsx'), 'utf8');
    expect(layout).not.toMatch(/from '\.\/library\/LibrarySurface'/);
  });
});
