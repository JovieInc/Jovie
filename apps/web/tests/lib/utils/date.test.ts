import { describe, expect, it } from 'vitest';
import {
  toDateOnlySafe,
  toISOStringOrFallback,
  toISOStringOrNull,
  toISOStringSafe,
} from '@/lib/utils/date';

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
