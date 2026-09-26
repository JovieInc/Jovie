import { describe, expect, it } from 'vitest';
import { formatEventDateParts, getEventLocalDateKey } from '@/lib/events/date';

describe('getEventLocalDateKey', () => {
  it('preserves ISO date-only strings without timezone shifting', () => {
    expect(
      getEventLocalDateKey({
        startDate: '2026-06-21',
        timezone: 'America/Los_Angeles',
      })
    ).toBe('2026-06-21');
  });

  it('formats timestamp inputs into event-local YYYY-MM-DD keys', () => {
    expect(
      getEventLocalDateKey({
        startDate: '2026-06-21T02:00:00Z',
        timezone: 'America/Los_Angeles',
      })
    ).toBe('2026-06-20');
  });
});

describe('formatEventDateParts', () => {
  it.each([
    ['2026-09-24T03:00:00Z', 'America/Chicago', 'Sep', '23'],
    ['2026-09-24T03:00:00Z', 'Asia/Tokyo', 'Sep', '24'],
    ['2026-01-01T03:00:00Z', 'America/Chicago', 'Dec', '31'],
    ['2026-03-09T04:30:00Z', 'America/New_York', 'Mar', '9'],
    ['2026-09-24', 'America/Chicago', 'Sep', '24'],
    ['2026-09-24T03:00:00Z', null, 'Sep', '24'],
    ['2026-09-24T03:00:00Z', 'Invalid/Zone', 'Sep', '24'],
  ])('formats %s in %s as %s %s', (startDate, timezone, month, day) => {
    expect(formatEventDateParts({ startDate, timezone })).toEqual({
      month,
      day,
    });
  });

  it('accepts Date instances and returns no pill for absent or invalid dates', () => {
    expect(
      formatEventDateParts({
        startDate: new Date('2026-09-24T03:00:00Z'),
        timezone: 'America/Chicago',
      })
    ).toEqual({ month: 'Sep', day: '23' });
    for (const startDate of [null, undefined, '', 'invalid', new Date(NaN)]) {
      expect(formatEventDateParts({ startDate })).toBeNull();
    }
  });
});
