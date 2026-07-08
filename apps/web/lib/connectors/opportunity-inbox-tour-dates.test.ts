import { describe, expect, it } from 'vitest';
import {
  classifySuggestedActionCategory,
  formatTourDateDisplay,
  formatTourDateLocation,
  looksLikeTourDateSignal,
  mapTourDateRowToInboxItem,
} from './opportunity-inbox-tour-dates';

describe('looksLikeTourDateSignal', () => {
  it('classifies tour/event kinds as tour dates by construction', () => {
    for (const kind of ['tour_date.detected', 'tour.sync', 'event.detected']) {
      expect(
        looksLikeTourDateSignal({ kind, payload: {}, rationale: null })
      ).toBe(true);
    }
  });

  it('classifies calendar events with venue-shaped payloads as tour dates', () => {
    expect(
      looksLikeTourDateSignal({
        kind: 'calendar.create_event',
        payload: { title: 'Detroit', venueName: 'Saint Andrews Hall' },
        rationale: null,
      })
    ).toBe(true);
    expect(
      looksLikeTourDateSignal({
        kind: 'calendar.create_event',
        payload: { title: 'Detroit', city: 'Detroit' },
        rationale: null,
      })
    ).toBe(true);
  });

  it('classifies calendar events with tour keywords in text as tour dates', () => {
    expect(
      looksLikeTourDateSignal({
        kind: 'calendar.create_event',
        payload: { title: 'Summer festival slot — tickets on sale Friday' },
        rationale: null,
      })
    ).toBe(true);
    expect(
      looksLikeTourDateSignal({
        kind: 'calendar.create_event',
        payload: {},
        rationale: 'Promoter confirmed the concert date for August.',
      })
    ).toBe(true);
  });

  it('leaves non-tour calendar events and other kinds as suggestions', () => {
    expect(
      looksLikeTourDateSignal({
        kind: 'calendar.create_event',
        payload: { title: 'Weekly catalog review' },
        rationale: 'Recurring planning block.',
      })
    ).toBe(false);
    expect(
      looksLikeTourDateSignal({
        kind: 'merch.create_drop',
        payload: { title: 'Tour tee restock' },
        rationale: null,
      })
    ).toBe(false);
  });

  it('handles non-object payloads without throwing', () => {
    expect(
      looksLikeTourDateSignal({
        kind: 'calendar.create_event',
        payload: null,
        rationale: null,
      })
    ).toBe(false);
  });
});

describe('classifySuggestedActionCategory', () => {
  it('maps the boolean signal onto card categories', () => {
    expect(
      classifySuggestedActionCategory({
        kind: 'tour_date.detected',
        payload: {},
        rationale: null,
      })
    ).toBe('tour_date');
    expect(
      classifySuggestedActionCategory({
        kind: 'calendar.create_event',
        payload: { title: 'Weekly catalog review' },
        rationale: null,
      })
    ).toBe('suggestion');
  });
});

describe('mapTourDateRowToInboxItem', () => {
  const row = {
    id: 'td-1',
    title: null,
    startDate: new Date('2026-08-14T00:00:00.000Z'),
    startTime: '7:00 PM',
    venueName: 'Saint Andrews Hall',
    city: 'Detroit',
    region: 'MI',
    country: 'US',
    provider: 'bandsintown',
    confirmationStatus: 'pending' as const,
  };

  it('falls back to the venue name when title is missing', () => {
    const item = mapTourDateRowToInboxItem(row);
    expect(item).toMatchObject({
      id: 'td-1',
      title: 'Saint Andrews Hall',
      venueName: 'Saint Andrews Hall',
      location: 'Detroit, MI',
      providerLabel: 'Bandsintown',
      status: 'pending',
    });
    expect(item.startDate).toBe('2026-08-14T00:00:00.000Z');
  });

  it('labels unknown providers as detected', () => {
    const item = mapTourDateRowToInboxItem({
      ...row,
      provider: 'mystery_source',
    });
    expect(item.providerLabel).toBe('Detected');
  });
});

describe('formatTourDateLocation', () => {
  it('prefers region over country and skips blanks', () => {
    expect(
      formatTourDateLocation({ city: 'Detroit', region: 'MI', country: 'US' })
    ).toBe('Detroit, MI');
    expect(
      formatTourDateLocation({ city: 'London', region: null, country: 'UK' })
    ).toBe('London, UK');
    expect(
      formatTourDateLocation({ city: 'London', region: '  ', country: 'UK' })
    ).toBe('London, UK');
  });
});

describe('formatTourDateDisplay', () => {
  it('formats UTC-anchored dates with optional wall time', () => {
    expect(formatTourDateDisplay('2026-08-14T00:00:00.000Z', '7:00 PM')).toBe(
      'Fri, Aug 14, 2026 · 7:00 PM'
    );
    expect(formatTourDateDisplay('2026-08-14T00:00:00.000Z', null)).toBe(
      'Fri, Aug 14, 2026'
    );
  });

  it('returns the raw string for unparseable dates', () => {
    expect(formatTourDateDisplay('not-a-date', null)).toBe('not-a-date');
  });
});
