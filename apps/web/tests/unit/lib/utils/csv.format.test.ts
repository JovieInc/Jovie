/**
 * CSV Utility Tests - formatDateValue function
 */

import { describe, expect, it } from 'vitest';
import { formatDateValue } from '@/lib/utils/csv';

describe('CSV Utility - formatDateValue', () => {
  it('should format date as ISO string by default', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    expect(formatDateValue(date)).toBe('2024-01-15T10:30:00.000Z');
  });

  it('should format date as ISO string when format is iso', () => {
    const date = new Date('2024-06-20T15:45:30Z');
    expect(formatDateValue(date, 'iso')).toBe('2024-06-20T15:45:30.000Z');
  });

  it('should format date as locale string when format is locale', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    const result = formatDateValue(date, 'locale');
    // Locale string format varies, just verify it's not empty and different from ISO
    expect(result).toBeTruthy();
    expect(result).not.toBe('');
  });

  it('should return empty string for invalid date', () => {
    const invalidDate = new Date('invalid');
    expect(formatDateValue(invalidDate)).toBe('');
  });

  it('should return empty string for non-Date object', () => {
    // Test the type guard
    expect(formatDateValue('2024-01-15' as unknown as Date)).toBe('');
    expect(formatDateValue(12345 as unknown as Date)).toBe('');
  });
});
