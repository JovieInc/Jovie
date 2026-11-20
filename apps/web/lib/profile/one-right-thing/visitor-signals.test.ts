import { describe, expect, it } from 'vitest';
import {
  classifyVisitorSource,
  detectDevice,
  detectInAppBrowser,
  neutralVisitorSignals,
  normalizeCountry,
  resolveVisitorSignals,
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

describe('device and in-app detection', () => {
  it('detects in-app browsers by product token', () => {
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone) Instagram 330.0')).toBe(
      'instagram'
    );
    expect(detectInAppBrowser('Mozilla/5.0 [FBAN/FBIOS;FBAV/400]')).toBe(
      'facebook'
    );
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone) Spotify/9.0.40')).toBe(
      'spotify'
    );
    expect(detectInAppBrowser('Mozilla/5.0 (Macintosh) Safari/605')).toBeNull();
    expect(detectInAppBrowser(undefined)).toBeNull();
  });

  it('detects device class', () => {
    expect(detectDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17)')).toBe('ios');
    expect(detectDevice('Mozilla/5.0 (Linux; Android 14)')).toBe('android');
    expect(detectDevice('Mozilla/5.0 (Macintosh)')).toBe('desktop');
  });
});

describe('country and consent', () => {
  it('only accepts two letter codes', () => {
    expect(normalizeCountry('de')).toBe('DE');
    expect(normalizeCountry('XX')).toBeNull();
    expect(normalizeCountry('T1')).toBeNull();
    expect(normalizeCountry('USA')).toBeNull();
    expect(normalizeCountry(null)).toBeNull();
  });

  it('never reports returning without consent to read the marker', () => {
    const base = {
      referrer: null,
      search: '',
      userAgent: 'x',
      countryCookie: 'US',
      returningMarkerPresent: true,
      now: new Date('2026-10-25T00:00:00Z'),
    };
    expect(
      resolveVisitorSignals({ ...base, returningMarkerAllowed: false })
        .returning
    ).toBeNull();
    expect(
      resolveVisitorSignals({ ...base, returningMarkerAllowed: true }).returning
    ).toBe(true);
    expect(
      resolveVisitorSignals({
        ...base,
        returningMarkerAllowed: true,
        returningMarkerPresent: false,
      }).returning
    ).toBe(false);
  });

  it('neutral signals carry no per-visitor input', () => {
    const n = neutralVisitorSignals(new Date('2026-10-25T00:00:00Z'));
    expect(n).toMatchObject({
      source: { channel: 'direct', name: null },
      inApp: null,
      country: null,
      returning: null,
    });
  });
});
