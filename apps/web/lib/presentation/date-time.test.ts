import { describe, expect, it } from 'vitest';
import { formatISODate } from '../utils/date-formatting';
import {
  formatCalendarDate,
  formatInstant,
  instantToDateKey,
  isDateOnlyString,
  resolveTemporalContext,
} from './date-time';

describe('temporal context precedence', () => {
  it('prefers explicit preference over every weaker signal', () => {
    const ctx = resolveTemporalContext({
      preference: { timeZone: 'America/New_York' },
      persisted: { timeZone: 'Europe/London', locale: 'en-GB' },
      detected: { timeZone: 'Asia/Tokyo', locale: 'ja-JP' },
    });
    expect(ctx.timeZone).toBe('America/New_York');
    expect(ctx.locale).toBe('en-GB');
  });

  it('falls back to detected/device context and then product default', () => {
    expect(
      resolveTemporalContext({ detected: { locale: 'de-DE' } }).timeZone
    ).toBe('UTC');
    expect(
      resolveTemporalContext({ detected: { locale: 'de-DE' } }).locale
    ).toBe('de-DE');
  });
});

describe('calendar dates vs instants', () => {
  it('recognizes date-only strings', () => {
    expect(isDateOnlyString('2024-03-10')).toBe(true);
    expect(isDateOnlyString('2024-03-10T00:00:00Z')).toBe(false);
    expect(isDateOnlyString(new Date())).toBe(false);
  });

  it('keeps a calendar date on the same semantic day in every zone', () => {
    expect(formatCalendarDate('2024-03-10', { locale: 'en-US' })).toBe(
      'Mar 10, 2024'
    );
    // German ordering differs but the day never shifts.
    expect(formatCalendarDate('2024-03-10', { locale: 'de-DE' })).toBe(
      '10. März 2024'
    );
  });

  it('keys instants to the day boundary of the declared zone', () => {
    // 2024-03-10T05:30:00Z is still Mar 9 in Los Angeles.
    const instant = new Date('2024-03-10T05:30:00.000Z');
    expect(instantToDateKey(instant, 'UTC')).toBe('2024-03-10');
    expect(instantToDateKey(instant, 'America/Los_Angeles')).toBe('2024-03-09');
  });

  it('renders instants in the declared zone across DST', () => {
    const ctx = {
      locale: 'en-US',
      timeZone: 'America/Los_Angeles',
      hourCycle: 'h23' as const,
    };
    // Just before US DST starts (10:00 UTC on 2024-03-10): still PST.
    expect(formatInstant(new Date('2024-03-10T07:30:00.000Z'), ctx)).toContain(
      '23:30'
    );
    // After the transition: 19:30Z is 12:30 PDT (UTC-7), not 11:30 PST.
    expect(formatInstant(new Date('2024-03-11T19:30:00.000Z'), ctx)).toContain(
      '12:30'
    );
  });

  it('honors 12/24-hour presentation and locale ordering', () => {
    const instant = new Date('2024-06-15T14:30:00.000Z');
    const us12 = formatInstant(
      instant,
      { locale: 'en-US', timeZone: 'UTC' },
      { hour: 'numeric', minute: '2-digit' }
    );
    const de24 = formatInstant(
      instant,
      { locale: 'de-DE', timeZone: 'UTC' },
      { hour: 'numeric', minute: '2-digit' }
    );
    expect(us12).toBe('2:30 PM');
    expect(de24).toBe('14:30');
  });
});

describe('formatISODate date-only passthrough', () => {
  it('returns YYYY-MM-DD strings unchanged regardless of zone', () => {
    expect(formatISODate('2024-03-10')).toBe('2024-03-10');
  });
});
