import { describe, expect, it } from 'vitest';
import {
  type CalendarEvent,
  getEventEnd,
  getEventStart,
  hasOverlappingEvent,
} from '../list-events';

function makeEvent(
  id: string,
  startIso: string,
  endIso: string
): CalendarEvent {
  return {
    id,
    summary: `Event ${id}`,
    start: { dateTime: startIso },
    end: { dateTime: endIso },
    status: 'confirmed',
    etag: `"etag-${id}"`,
  };
}

describe('getEventStart', () => {
  it('returns dateTime when present', () => {
    const event = makeEvent(
      '1',
      '2026-05-23T01:00:00Z',
      '2026-05-23T03:00:00Z'
    );
    expect(getEventStart(event)).toBe('2026-05-23T01:00:00Z');
  });

  it('falls back to all-day date', () => {
    const event: CalendarEvent = {
      id: '2',
      summary: 'All day',
      start: { date: '2026-05-23' },
      end: { date: '2026-05-24' },
      status: 'confirmed',
      etag: '"etag-2"',
    };
    expect(getEventStart(event)).toBe('2026-05-23');
  });

  it('returns null when no start times present', () => {
    const event: CalendarEvent = {
      id: '3',
      summary: 'No times',
      start: {},
      end: {},
      status: 'confirmed',
      etag: '"etag-3"',
    };
    expect(getEventStart(event)).toBeNull();
  });
});

describe('getEventEnd', () => {
  it('returns dateTime when present', () => {
    const event = makeEvent(
      '1',
      '2026-05-23T01:00:00Z',
      '2026-05-23T03:00:00Z'
    );
    expect(getEventEnd(event)).toBe('2026-05-23T03:00:00Z');
  });
});

describe('hasOverlappingEvent', () => {
  it('detects an event within tolerance', () => {
    const events = [
      makeEvent('e1', '2026-05-23T01:00:00Z', '2026-05-23T03:00:00Z'),
    ];
    // Proposed starts 2 hours after — within 6-hour tolerance.
    expect(hasOverlappingEvent('2026-05-23T03:00:00Z', events, 6)).toBe(true);
  });

  it('does not flag events outside tolerance', () => {
    const events = [
      makeEvent('e1', '2026-05-23T01:00:00Z', '2026-05-23T03:00:00Z'),
    ];
    // Proposed starts 8 hours after — outside 6-hour tolerance.
    expect(hasOverlappingEvent('2026-05-23T09:00:00Z', events, 6)).toBe(false);
  });

  it('returns false for empty calendar', () => {
    expect(hasOverlappingEvent('2026-05-23T01:00:00Z', [], 6)).toBe(false);
  });

  it('matches exactly equal start times', () => {
    const events = [
      makeEvent('e1', '2026-05-23T01:00:00Z', '2026-05-23T03:00:00Z'),
    ];
    expect(hasOverlappingEvent('2026-05-23T01:00:00Z', events, 6)).toBe(true);
  });
});
