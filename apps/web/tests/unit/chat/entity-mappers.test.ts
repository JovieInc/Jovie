import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  formatLongDate,
  shortMonthDay,
} from '@/components/jovie/components/entity-mappers';

describe('shortMonthDay', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles';
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('formats a date-only ISO string correctly regardless of local TZ', () => {
    expect(shortMonthDay('2026-03-14')).toBe('Mar 14');
  });

  it('formats a datetime ISO string and preserves the UTC date', () => {
    expect(shortMonthDay('2026-03-14T20:00:00Z')).toBe('Mar 14');
  });

  it('returns undefined for empty input', () => {
    expect(shortMonthDay('')).toBeUndefined();
    expect(shortMonthDay(undefined)).toBeUndefined();
  });

  it('returns undefined for invalid date strings', () => {
    expect(shortMonthDay('not-a-date')).toBeUndefined();
  });
});

describe('formatLongDate', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles';
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('formats a date-only ISO string correctly regardless of local TZ', () => {
    expect(formatLongDate('2026-03-14')).toBe('Mar 14, 2026');
  });

  it('formats a datetime ISO string and preserves the UTC date', () => {
    expect(formatLongDate('2026-03-14T20:00:00Z')).toBe('Mar 14, 2026');
  });

  it('returns null for empty input', () => {
    expect(formatLongDate('')).toBeNull();
    expect(formatLongDate(undefined)).toBeNull();
  });

  it('returns null for invalid date strings', () => {
    expect(formatLongDate('not-a-date')).toBeNull();
  });
});
