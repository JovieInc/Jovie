import { describe, expect, it } from 'vitest';
import {
  canonicalizeSurfaceUrl,
  isSharedProfileHost,
  type MonitoringCandidate,
  redactLockedRank,
  selectDefaultMonitoredSurfaceIds,
  selectRetirableSurfaceIds,
} from '@/lib/profile-surfaces/contracts';

describe('canonicalizeSurfaceUrl', () => {
  it('normalizes aliases, tracking parameters, and paths without fetching', () => {
    expect(
      canonicalizeSurfaceUrl(
        'http://mobile.twitter.com/TimWhite/?utm_source=test&b=2&a=1#bio'
      )
    ).toEqual({
      url: 'https://x.com/TimWhite?a=1&b=2',
      hostname: 'x.com',
      isSharedHost: true,
    });
  });

  it('normalizes www aliases before generating the unique URL key', () => {
    expect(canonicalizeSurfaceUrl('https://www.twitter.com/TimWhite')).toEqual({
      url: 'https://x.com/TimWhite',
      hostname: 'x.com',
      isSharedHost: true,
    });
  });

  it('preserves meaningful query parameters and Unicode paths', () => {
    expect(
      canonicalizeSurfaceUrl('https://example.com/Tim%20White/?lang=en')
    ).toEqual({
      url: 'https://example.com/Tim%20White?lang=en',
      hostname: 'example.com',
      isSharedHost: false,
    });
  });

  it.each([
    'javascript:alert(1)',
    'ftp://example.com/profile',
    ['https://user', ':password', '@example.com/profile'].join(''),
    'not a url',
  ])('rejects unsafe URL %s', input => {
    expect(canonicalizeSurfaceUrl(input)).toBeNull();
  });
});

describe('isSharedProfileHost', () => {
  it('recognizes shared hosts and their locale subdomains', () => {
    expect(isSharedProfileHost('en.wikipedia.org')).toBe(true);
    expect(isSharedProfileHost('www.youtube.com')).toBe(true);
    expect(isSharedProfileHost('artist.example.com')).toBe(false);
  });
});

describe('redactLockedRank', () => {
  it('omits current and historical rank values for locked surfaces', () => {
    expect(redactLockedRank(true, 7)).toBeNull();
    expect(redactLockedRank(true, null)).toBeNull();
    expect(redactLockedRank(false, 2)).toBe(2);
  });
});

describe('selectRetirableSurfaceIds', () => {
  it('retires only surfaces absent from current evidence and live sources', () => {
    expect(
      selectRetirableSurfaceIds(
        ['current', 'stale', 'still-live'],
        ['current'],
        ['current', 'still-live']
      )
    ).toEqual(['stale']);
  });
});

describe('redactLockedRank', () => {
  it('omits current and historical rank values for locked surfaces', () => {
    expect(redactLockedRank(true, 7)).toBeNull();
    expect(redactLockedRank(true, null)).toBeNull();
    expect(redactLockedRank(false, 2)).toBe(2);
  });
});

describe('selectDefaultMonitoredSurfaceIds', () => {
  const candidate = (
    input: Partial<MonitoringCandidate> & Pick<MonitoringCandidate, 'id'>
  ): MonitoringCandidate => ({
    kind: 'social',
    platform: 'instagram',
    qualificationStatus: 'qualified',
    isOfficial: true,
    ...input,
  });

  it('does not count Jovie and applies website, social, DSP, authority order', () => {
    const candidates = [
      candidate({ id: 'authority', kind: 'authority', platform: 'wikipedia' }),
      candidate({ id: 'spotify', kind: 'dsp', platform: 'spotify' }),
      candidate({ id: 'youtube', platform: 'youtube' }),
      candidate({ id: 'instagram' }),
      candidate({ id: 'website', kind: 'website', platform: 'website' }),
      candidate({ id: 'jovie', kind: 'jovie', platform: 'jovie' }),
    ];

    expect(selectDefaultMonitoredSurfaceIds(candidates, 3)).toEqual([
      'website',
      'instagram',
      'youtube',
    ]);
  });

  it('excludes unqualified and user-paused surfaces', () => {
    const candidates = [
      candidate({ id: 'paused', userPaused: true }),
      candidate({ id: 'suggested', qualificationStatus: 'suggested' }),
      candidate({ id: 'active', platform: 'tiktok' }),
    ];

    expect(selectDefaultMonitoredSurfaceIds(candidates, 5)).toEqual(['active']);
  });

  it('treats null as unlimited and never accepts a negative limit', () => {
    const candidates = [candidate({ id: 'a' }), candidate({ id: 'b' })];

    expect(selectDefaultMonitoredSurfaceIds(candidates, null)).toEqual([
      'a',
      'b',
    ]);
    expect(selectDefaultMonitoredSurfaceIds(candidates, -1)).toEqual([]);
  });
});
