import { describe, expect, it } from 'vitest';
import {
  classifyVisitorSource,
  neutralVisitorSignals,
} from './visitor-signals';

describe('classifyVisitorSource', () => {
  it('reads the referrer host', () => {
    expect(
      classifyVisitorSource({
        referrer: 'https://open.spotify.com/artist/x',
        search: '',
      })
    ).toEqual({ channel: 'dsp', name: 'spotify' });
    expect(
      classifyVisitorSource({
        referrer: 'https://l.instagram.com/?u=1',
        search: '',
      })
    ).toEqual({ channel: 'social', name: 'instagram' });
    expect(
      classifyVisitorSource({ referrer: 'https://www.google.com/', search: '' })
    ).toEqual({ channel: 'search', name: 'google' });
    expect(
      classifyVisitorSource({ referrer: 'https://example.org/', search: '' })
    ).toEqual({ channel: 'other', name: null });
  });

  it('prefers utm_source over the referrer', () => {
    expect(
      classifyVisitorSource({
        referrer: 'https://www.google.com/',
        search: '?utm_source=ig',
      })
    ).toEqual({ channel: 'social', name: 'instagram' });
    expect(
      classifyVisitorSource({
        referrer: null,
        search: '?utm_source=Apple%20Music',
      })
    ).toEqual({ channel: 'dsp', name: 'apple_music' });
  });

  it('treats missing, invalid and own-host referrers as direct', () => {
    expect(classifyVisitorSource({ referrer: '', search: '' }).channel).toBe(
      'direct'
    );
    expect(
      classifyVisitorSource({ referrer: 'not a url', search: '' }).channel
    ).toBe('direct');
    expect(
      classifyVisitorSource({
        referrer: 'https://jov.ie/tim',
        search: '',
        ownHost: 'jov.ie',
      }).channel
    ).toBe('direct');
  });
});

describe('neutralVisitorSignals', () => {
  it('carries no per-visitor input', () => {
    expect(
      neutralVisitorSignals(new Date('2026-10-25T00:00:00Z'))
    ).toMatchObject({
      source: { channel: 'direct', name: null },
      inApp: null,
      country: null,
      returning: null,
      device: 'unknown',
    });
  });
});
