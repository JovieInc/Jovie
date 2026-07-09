import { describe, expect, it } from 'vitest';
import {
  computeTaskDueDate,
  parseTaskDate,
  sanitizeTaskDueAt,
  toDueIso,
} from './task-due-date';

describe('parseTaskDate', () => {
  it('parses Date, ISO strings, and unix seconds vs ms', () => {
    expect(
      parseTaskDate(new Date('2026-04-15T00:00:00.000Z'))?.toISOString()
    ).toBe('2026-04-15T00:00:00.000Z');
    expect(parseTaskDate('2026-04-15T00:00:00.000Z')?.toISOString()).toBe(
      '2026-04-15T00:00:00.000Z'
    );
    // 2014-05-13T16:53:20.000Z as seconds
    expect(parseTaskDate(1_400_000_000)?.toISOString()).toBe(
      '2014-05-13T16:53:20.000Z'
    );
    // same instant as ms
    expect(parseTaskDate(1_400_000_000_000)?.toISOString()).toBe(
      '2014-05-13T16:53:20.000Z'
    );
    expect(parseTaskDate('not-a-date')).toBeNull();
    expect(parseTaskDate(null)).toBeNull();
  });
});

describe('computeTaskDueDate', () => {
  const now = new Date('2026-04-25T12:00:00.000Z');

  it('applies negative and positive offsets from a valid release baseline', () => {
    const releaseDate = new Date('2026-04-15T00:00:00.000Z');
    expect(
      computeTaskDueDate(releaseDate, -28, { now })?.toISOString().slice(0, 10)
    ).toBe('2026-03-18');
    expect(
      computeTaskDueDate(releaseDate, 7, { now })?.toISOString().slice(0, 10)
    ).toBe('2026-04-22');
    expect(
      computeTaskDueDate(releaseDate, 0, { now })?.toISOString().slice(0, 10)
    ).toBe('2026-04-15');
  });

  it('returns null for missing offset, missing baseline, or pre-2000 epoch-like baselines', () => {
    expect(
      computeTaskDueDate(new Date('2026-04-15T00:00:00.000Z'), null, { now })
    ).toBeNull();
    expect(computeTaskDueDate(null, -30, { now })).toBeNull();
    expect(
      computeTaskDueDate(new Date('1970-01-01T00:00:00.000Z'), -30, { now })
    ).toBeNull();
  });

  it('returns null when the computed due is a multi-year historical overdue', () => {
    // 2014 release + -30d → ~12 years ago relative to 2026
    expect(
      computeTaskDueDate(new Date('2014-06-01T00:00:00.000Z'), -30, { now })
    ).toBeNull();
    expect(
      computeTaskDueDate(new Date('2017-03-01T00:00:00.000Z'), -28, { now })
    ).toBeNull();
  });

  it('keeps recently overdue and near-future dues', () => {
    expect(
      computeTaskDueDate(new Date('2026-04-20T00:00:00.000Z'), 0, { now })
    ).not.toBeNull();
    expect(
      computeTaskDueDate(new Date('2026-05-01T00:00:00.000Z'), -7, { now })
    ).not.toBeNull();
  });
});

describe('sanitizeTaskDueAt', () => {
  const now = new Date('2026-04-25T12:00:00.000Z');

  it('drops absurd multi-year overdue values used by DueChip', () => {
    expect(
      sanitizeTaskDueAt(new Date('2014-04-25T12:00:00.000Z'), { now })
    ).toBeNull();
    expect(
      sanitizeTaskDueAt(new Date('2026-04-20T12:00:00.000Z'), { now })
    ).not.toBeNull();
  });
});

describe('toDueIso', () => {
  it('accepts Date and ISO string inputs', () => {
    expect(toDueIso(new Date('2026-04-25T12:00:00.000Z'))).toBe(
      '2026-04-25T12:00:00.000Z'
    );
    expect(toDueIso('2026-04-25T12:00:00.000Z')).toBe(
      '2026-04-25T12:00:00.000Z'
    );
    expect(toDueIso(null)).toBeNull();
  });
});
