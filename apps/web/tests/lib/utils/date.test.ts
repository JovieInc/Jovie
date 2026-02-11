import { describe, expect, it } from 'vitest';
import { toISOStringSafe } from '@/lib/utils/date';

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
