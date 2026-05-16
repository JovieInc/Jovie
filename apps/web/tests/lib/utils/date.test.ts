import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  toDateOnlySafe,
  toISOStringOrFallback,
  toISOStringOrNull,
  toISOStringSafe,
} from '@/lib/utils/date';
import { formatTimeAgo } from '@/lib/utils/date-formatting';

afterEach(() => {
  vi.useRealTimers();
});

describe('toISOStringSafe', () => {
  it('returns ISO string from Date object', () => {
    const date = new Date('2024-06-15T12:00:00.000Z');
    expect(toISOStringSafe(date)).toBe('2024-06-15T12:00:00.000Z');
  });

  it('returns string as-is when already a string', () => {
    expect(toISOStringSafe('2024-06-15T12:00:00.000Z')).toBe(
      '2024-06-15T12:00:00.000Z'
    );
  });

  it('handles date-only string', () => {
    expect(toISOStringSafe('2024-06-15')).toBe('2024-06-15');
  });
});

describe('toISOStringOrNull', () => {
  it('returns null for null', () => {
    expect(toISOStringOrNull(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(toISOStringOrNull(undefined)).toBeNull();
  });

  it('returns ISO string from Date object', () => {
    const date = new Date('2024-06-15T12:00:00.000Z');
    expect(toISOStringOrNull(date)).toBe('2024-06-15T12:00:00.000Z');
  });

  it('returns string as-is when already a string', () => {
    expect(toISOStringOrNull('2024-06-15T12:00:00.000Z')).toBe(
      '2024-06-15T12:00:00.000Z'
    );
  });

  it('returns null for empty string', () => {
    expect(toISOStringOrNull('')).toBeNull();
  });
});

describe('toDateOnlySafe', () => {
  it('extracts date portion from Date object', () => {
    const date = new Date('2024-06-15T12:00:00.000Z');
    expect(toDateOnlySafe(date)).toBe('2024-06-15');
  });

  it('extracts date portion from ISO string', () => {
    expect(toDateOnlySafe('2024-06-15T12:00:00.000Z')).toBe('2024-06-15');
  });

  it('handles date-only string input', () => {
    expect(toDateOnlySafe('2024-06-15')).toBe('2024-06-15');
  });
});

describe('toISOStringOrFallback', () => {
  it('returns ISO string from Date', () => {
    const date = new Date('2024-06-15T12:00:00.000Z');
    expect(toISOStringOrFallback(date)).toBe('2024-06-15T12:00:00.000Z');
  });

  it('returns string as-is', () => {
    expect(toISOStringOrFallback('2024-06-15T12:00:00.000Z')).toBe(
      '2024-06-15T12:00:00.000Z'
    );
  });

  it('returns current time for null input', () => {
    const before = new Date().toISOString();
    const result = toISOStringOrFallback(null);
    const after = new Date().toISOString();
    expect(result >= before && result <= after).toBe(true);
  });

  it('returns current time for undefined input', () => {
    const before = new Date().toISOString();
    const result = toISOStringOrFallback(undefined);
    const after = new Date().toISOString();
    expect(result >= before && result <= after).toBe(true);
  });

  it('returns explicit fallback when provided', () => {
    expect(toISOStringOrFallback(null, 'fallback-value')).toBe(
      'fallback-value'
    );
  });

  it('returns explicit fallback for empty string', () => {
    expect(toISOStringOrFallback('', 'fallback-value')).toBe('fallback-value');
  });
});

describe('formatTimeAgo', () => {
  it('keeps recent activity labels compact', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));

    expect(formatTimeAgo('2026-04-25T11:59:30Z')).toBe('just now');
    expect(formatTimeAgo('2026-04-25T11:55:00Z')).toBe('5m ago');
    expect(formatTimeAgo('2026-04-25T09:00:00Z')).toBe('3h ago');
    expect(formatTimeAgo('2026-04-22T12:00:00Z')).toBe('3d ago');
  });

  it('does not expose raw day counts for older dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));

    expect(formatTimeAgo('2026-04-04T12:00:00Z')).toBe('3w ago');
    expect(formatTimeAgo('2026-01-15T12:00:00Z')).toBe('3mo ago');
    expect(formatTimeAgo('2024-04-19T12:00:00Z')).toBe('2y ago');
  });

  it('returns a dash for missing or invalid dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));

    expect(formatTimeAgo(null)).toBe('—');
    expect(formatTimeAgo('not-a-date')).toBe('—');
  });
});
