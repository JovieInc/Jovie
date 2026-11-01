import { describe, expect, it } from 'vitest';
import {
  explicitSegmentFromSettings,
  inferSegment,
  isMusicSegment,
  NEUTRAL_SEGMENT,
  SEGMENTS,
} from './segments';

describe('inferSegment', () => {
  it('uses an explicit choice with full confidence', () => {
    const r = inferSegment({ explicit: 'comedian', platforms: ['spotify'] });
    expect(r).toMatchObject({
      segment: 'comedian',
      confidence: 1,
      source: 'explicit',
    });
  });

  it('treats explicit "other" as neutral', () => {
    expect(inferSegment({ explicit: 'other' }).segment).toBe(NEUTRAL_SEGMENT);
  });

  it('returns neutral with no signals', () => {
    expect(inferSegment({})).toMatchObject({
      segment: 'neutral',
      source: 'none',
    });
  });

  it('infers musician from catalog plus platform plus type', () => {
    const r = inferSegment({
      creatorType: 'artist',
      hasMusicCatalog: true,
      platforms: ['spotify', 'bandcamp'],
    });
    expect(r.segment).toBe('musician');
    expect(r.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('infers comedian from the onboarding answer even with a Spotify link', () => {
    const r = inferSegment({
      creatorType: 'artist',
      platforms: ['spotify'],
      onboardingAnswer: "I'm a stand-up comedian touring clubs",
    });
    expect(r.segment).toBe('comedian');
  });

  it('infers DJ from Beatport plus bio', () => {
    const r = inferSegment({
      platforms: ['beatport'],
      bio: 'Techno DJ in Berlin',
    });
    expect(r.segment).toBe('dj_producer');
  });

  it('infers athlete from Strava', () => {
    expect(
      inferSegment({ platforms: ['strava'], bio: 'Marathon runner' }).segment
    ).toBe('athlete');
  });

  it('stays neutral below the confidence threshold', () => {
    const r = inferSegment({ platforms: ['youtube'] });
    expect(r.segment).toBe('neutral');
    expect(r.candidate).toBe('streamer');
  });

  it('stays neutral when two segments are too close', () => {
    const r = inferSegment({
      platforms: ['spotify', 'soundcloud'],
      bio: 'dj and singer',
    });
    expect(r.segment).toBe('neutral');
  });

  it('only music segments count as music', () => {
    expect(SEGMENTS.filter(isMusicSegment)).toEqual([
      'musician',
      'dj_producer',
    ]);
    expect(isMusicSegment('neutral')).toBe(false);
  });
});

describe('explicitSegmentFromSettings', () => {
  it('reads a valid value and ignores junk', () => {
    expect(explicitSegmentFromSettings({ segment: 'athlete' })).toBe('athlete');
    expect(explicitSegmentFromSettings({ segment: 'wizard' })).toBeNull();
    expect(explicitSegmentFromSettings(null)).toBeNull();
  });
});
