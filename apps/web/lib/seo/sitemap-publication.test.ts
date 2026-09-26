import { describe, expect, it } from 'vitest';
import {
  latestContentRevision,
  toContentRevisionDate,
} from './sitemap-publication';

describe('toContentRevisionDate', () => {
  it('copies a Date without sharing the instance', () => {
    const input = new Date('2026-04-15T00:00:00.000Z');
    const copy = toContentRevisionDate(input);

    expect(copy).toBeInstanceOf(Date);
    expect(copy).not.toBe(input);
    expect(copy?.toISOString()).toBe('2026-04-15T00:00:00.000Z');
    copy?.setUTCDate(20);
    expect(input.toISOString()).toBe('2026-04-15T00:00:00.000Z');
  });

  it('parses strings and drops values that are not dates', () => {
    expect(
      toContentRevisionDate('2026-04-15T00:00:00.000Z')?.toISOString()
    ).toBe('2026-04-15T00:00:00.000Z');
    expect(toContentRevisionDate('not-a-date')).toBeUndefined();
    expect(toContentRevisionDate(null)).toBeUndefined();
    expect(toContentRevisionDate('')).toBeUndefined();
  });

  it('picks the latest revision across mixed inputs', () => {
    const latest = latestContentRevision(
      '2026-01-01T00:00:00.000Z',
      new Date('2026-06-01T00:00:00.000Z'),
      null
    );
    expect(latest?.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});
