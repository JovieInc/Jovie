import { describe, expect, it } from 'vitest';
import { LIBRARY_TABLE_COLUMNS } from '@/app/app/(shell)/library/LibrarySurface';
import { LIBRARY_CATALOG_TABLE_COLUMNS } from '@/components/features/library/library-catalog-columns';
import {
  columnPrioritySpecsFromDefs,
  resolveColumnPriorityLayout,
} from '@/components/organisms/table/column-priority';

describe('library column priority', () => {
  it('drops the squeezed list columns when a detail panel narrows the table', () => {
    const layout = resolveColumnPriorityLayout(
      columnPrioritySpecsFromDefs(LIBRARY_TABLE_COLUMNS),
      532
    );

    expect(layout.hiddenIds).toEqual(
      expect.arrayContaining(['shareUrl', 'type'])
    );
    // The status glyph is 40px and never drops, unlike the old word pills.
    expect(layout.hiddenIds).not.toContain('status');
    expect(layout.hiddenIds).not.toContain('release');
    expect(layout.hiddenIds).not.toContain('releaseDate');
    expect(layout.hiddenIds).not.toContain('actions');
  });

  it('keeps status and providers on a wide table', () => {
    const layout = resolveColumnPriorityLayout(
      columnPrioritySpecsFromDefs(LIBRARY_TABLE_COLUMNS),
      1100
    );

    expect(layout.hiddenIds).not.toContain('status');
    expect(layout.hiddenIds).not.toContain('providers');
  });

  it('keeps the full catalog column set before the container is measured', () => {
    const layout = resolveColumnPriorityLayout(
      columnPrioritySpecsFromDefs(LIBRARY_CATALOG_TABLE_COLUMNS),
      1440
    );

    expect(layout.hiddenIds).not.toContain('waveform');
    expect(layout.hiddenIds).not.toContain('artist');
  });

  it('hides the catalog waveform before the title when the panel is open', () => {
    const layout = resolveColumnPriorityLayout(
      columnPrioritySpecsFromDefs(LIBRARY_CATALOG_TABLE_COLUMNS),
      532
    );

    expect(layout.hiddenIds).toContain('waveform');
    expect(layout.hiddenIds).toContain('artist');
    expect(layout.hiddenIds).not.toContain('title');
    expect(layout.hiddenIds).not.toContain('status');
  });

  it('leaves no placeholder compacts beside the title when columns hide', () => {
    const compactFor = (id: string) =>
      (
        LIBRARY_CATALOG_TABLE_COLUMNS.find(column => column.id === id)?.meta as
          | { compact?: (asset: unknown) => unknown }
          | undefined
      )?.compact;

    for (const metric of ['bpm', 'key', 'energy', 'rating']) {
      expect(compactFor(metric)).toBeUndefined();
    }
    for (const id of ['artist', 'type', 'providers', 'length']) {
      expect(compactFor(id)).toBeUndefined();
    }
  });

  it('never folds the share URL beside a list title', () => {
    const shareColumn = LIBRARY_TABLE_COLUMNS.find(
      column => column.id === 'shareUrl'
    );
    expect(
      (shareColumn?.meta as { compact?: unknown } | undefined)?.compact
    ).toBeUndefined();
  });
});
