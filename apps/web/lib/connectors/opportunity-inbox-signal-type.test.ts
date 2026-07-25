import { describe, expect, it } from 'vitest';
import {
  classifyOpportunitySignalType,
  isOpportunitySignalType,
  OPPORTUNITY_SIGNAL_TYPE_META,
} from './opportunity-inbox-signal-type';

describe('classifyOpportunitySignalType', () => {
  it('prefers a persisted signal_type over heuristics', () => {
    expect(
      classifyOpportunitySignalType({
        kind: 'calendar.create_event',
        payload: { title: 'Book a show in Detroit' },
        rationale: null,
        signalType: 'new_song',
      })
    ).toBe('new_song');
  });

  it('ignores an invalid persisted signal_type and falls back to rules', () => {
    expect(
      classifyOpportunitySignalType({
        kind: 'calendar.create_event',
        payload: {},
        rationale: null,
        signalType: 'bogus_value',
      })
    ).toBe('new_event');
  });

  it('classifies by detector kind prefix', () => {
    expect(
      classifyOpportunitySignalType({
        kind: 'release.detected',
        payload: {},
        rationale: null,
      })
    ).toBe('new_song');
    expect(
      classifyOpportunitySignalType({
        kind: 'calendar.create_event',
        payload: {},
        rationale: null,
      })
    ).toBe('new_event');
    expect(
      classifyOpportunitySignalType({
        kind: 'profile.match_found',
        payload: {},
        rationale: null,
      })
    ).toBe('new_profile_match');
  });

  it('classifies songs from payload text', () => {
    expect(
      classifyOpportunitySignalType({
        kind: 'unknown.kind',
        payload: { title: 'New single detected on Spotify' },
        rationale: null,
      })
    ).toBe('new_song');
  });

  it('classifies events from rationale text', () => {
    expect(
      classifyOpportunitySignalType({
        kind: 'unknown.kind',
        payload: {},
        rationale: 'A promoter mentioned tour dates in Chicago.',
      })
    ).toBe('new_event');
  });

  it('classifies profile matches ahead of event keywords', () => {
    expect(
      classifyOpportunitySignalType({
        kind: 'unknown.kind',
        payload: {
          title: 'Profile match: similar artist also touring the midwest',
        },
        rationale: null,
      })
    ).toBe('new_profile_match');
  });

  it('falls back to other when nothing matches', () => {
    expect(
      classifyOpportunitySignalType({
        kind: 'unknown.kind',
        payload: { title: 'Update your bio' },
        rationale: null,
      })
    ).toBe('other');
  });

  it('handles non-object payloads without throwing', () => {
    expect(
      classifyOpportunitySignalType({
        kind: 'unknown.kind',
        payload: null,
        rationale: null,
      })
    ).toBe('other');
    expect(
      classifyOpportunitySignalType({
        kind: 'unknown.kind',
        payload: 'raw string payload',
        rationale: null,
      })
    ).toBe('other');
  });
});

describe('isOpportunitySignalType', () => {
  it('accepts known types and rejects everything else', () => {
    expect(isOpportunitySignalType('new_song')).toBe(true);
    expect(isOpportunitySignalType('other')).toBe(true);
    expect(isOpportunitySignalType('bogus')).toBe(false);
    expect(isOpportunitySignalType(null)).toBe(false);
    expect(isOpportunitySignalType(42)).toBe(false);
  });
});

describe('OPPORTUNITY_SIGNAL_TYPE_META', () => {
  it('provides Title Case labels for every type', () => {
    expect(OPPORTUNITY_SIGNAL_TYPE_META.new_song.label).toBe('New Song');
    expect(OPPORTUNITY_SIGNAL_TYPE_META.new_event.label).toBe('New Event');
    expect(OPPORTUNITY_SIGNAL_TYPE_META.new_profile_match.label).toBe(
      'Profile Match'
    );
    expect(OPPORTUNITY_SIGNAL_TYPE_META.other.label).toBe('Suggestion');
  });
});
