import { describe, expect, it } from 'vitest';
import {
  dedupeReleaseTasks,
  getReleaseTaskWorkKey,
} from './dedupe-release-tasks';

function task(partial: {
  id: string;
  taskNumber: number;
  releaseId: string | null;
  title: string;
  catalogSlug?: string;
}) {
  return {
    id: partial.id,
    taskNumber: partial.taskNumber,
    releaseId: partial.releaseId,
    title: partial.title,
    metadata: partial.catalogSlug ? { catalogSlug: partial.catalogSlug } : null,
  };
}

describe('getReleaseTaskWorkKey', () => {
  it('keys by catalogSlug when present, else normalized title', () => {
    expect(
      getReleaseTaskWorkKey(
        task({
          id: 'a',
          taskNumber: 2,
          releaseId: 'r1',
          title: 'Enter metadata',
          catalogSlug: 'enter-metadata',
        })
      )
    ).toBe('release:r1:enter-metadata');

    expect(
      getReleaseTaskWorkKey(
        task({
          id: 'b',
          taskNumber: 22,
          releaseId: 'r1',
          title: 'Enter metadata',
        })
      )
    ).toBe('release:r1:enter metadata');
  });

  it('does not collapse standalone tasks by title', () => {
    expect(
      getReleaseTaskWorkKey(
        task({
          id: 'solo-1',
          taskNumber: 1,
          releaseId: null,
          title: 'Custom',
        })
      )
    ).toBe('id:solo-1');
  });
});

describe('dedupeReleaseTasks', () => {
  it('collapses duplicate rows for the same release work (J-2 & J-22 style)', () => {
    const rows = [
      task({
        id: 't2',
        taskNumber: 2,
        releaseId: 'r1',
        title: 'Enter metadata (ISRC, UPC, credits, genres)',
      }),
      task({
        id: 't8',
        taskNumber: 8,
        releaseId: 'r1',
        title: 'Pitch to Apple Music editorial',
      }),
      task({
        id: 't22',
        taskNumber: 22,
        releaseId: 'r1',
        title: 'Enter metadata (ISRC, UPC, credits, genres)',
      }),
      task({
        id: 't28',
        taskNumber: 28,
        releaseId: 'r1',
        title: 'Pitch to Apple Music editorial',
      }),
      task({
        id: 't9',
        taskNumber: 9,
        releaseId: 'r1',
        title: 'Pitch to Amazon Music editorial',
      }),
      task({
        id: 't29',
        taskNumber: 29,
        releaseId: 'r1',
        title: 'Pitch to Amazon Music editorial',
      }),
    ];

    const deduped = dedupeReleaseTasks(rows);
    expect(deduped.map(t => t.taskNumber)).toEqual([2, 8, 9]);
    expect(deduped.map(t => t.id)).toEqual(['t2', 't8', 't9']);
  });

  it('keeps same title across different releases', () => {
    const rows = [
      task({
        id: 'a',
        taskNumber: 2,
        releaseId: 'r1',
        title: 'Enter metadata',
      }),
      task({
        id: 'b',
        taskNumber: 22,
        releaseId: 'r2',
        title: 'Enter metadata',
      }),
    ];
    expect(dedupeReleaseTasks(rows)).toHaveLength(2);
  });

  it('prefers lowest task number when catalogSlug collides', () => {
    const rows = [
      task({
        id: 'later',
        taskNumber: 40,
        releaseId: 'r1',
        title: 'Different title',
        catalogSlug: 'enter-metadata',
      }),
      task({
        id: 'earlier',
        taskNumber: 5,
        releaseId: 'r1',
        title: 'Enter metadata',
        catalogSlug: 'enter-metadata',
      }),
    ];
    const deduped = dedupeReleaseTasks(rows);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.id).toBe('earlier');
  });
});
