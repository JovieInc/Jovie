import { describe, expect, it } from 'vitest';
import { calendarDeadlineClock } from './calendar-deadline-clock';

describe('calendarDeadlineClock', () => {
  const pinned = new Date(86_400_000);

  it('returns a copy of the pinned instant outside the time-bomb scan', () => {
    const clock = calendarDeadlineClock(pinned, {});
    expect(clock.getTime()).toBe(pinned.getTime());
    expect(clock).not.toBe(pinned);
    expect(
      calendarDeadlineClock(pinned, { CALENDAR_DEADLINE_SCAN: '0' }).getTime()
    ).toBe(pinned.getTime());
  });

  it('returns the real clock inside the time-bomb scan', () => {
    const before = Date.now();
    const clock = calendarDeadlineClock(pinned, {
      CALENDAR_DEADLINE_SCAN: '1',
    }).getTime();
    expect(clock).toBeGreaterThanOrEqual(before);
    expect(clock).toBeLessThanOrEqual(Date.now());
  });
});
