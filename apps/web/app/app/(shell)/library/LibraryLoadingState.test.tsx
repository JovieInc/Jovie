import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LIBRARY_TABLE_SKELETON_COLUMNS,
  LIBRARY_VIEW_FILTER_CHIP_KEYS,
} from './LibraryLoadingState';
import { LIBRARY_TABLE_COLUMNS, PRESETS } from './LibrarySurface';

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
  it('matches the loaded Library table geometry so the swap cannot shift', () => {
    expect(geometry(LIBRARY_TABLE_SKELETON_COLUMNS)).toEqual(
      geometry(LIBRARY_TABLE_COLUMNS)
    );
  });

  it('reserves one filter chip per Library view preset', () => {
    expect(LIBRARY_VIEW_FILTER_CHIP_KEYS).toEqual(
      PRESETS.map(preset => preset.id)
    );
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
