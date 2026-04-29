import { describe, expect, it } from 'vitest';
import { getEventLocalDateKey } from '@/lib/events/date';

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
