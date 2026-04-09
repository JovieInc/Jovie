import { describe, expect, it } from 'vitest';
import {
  buildInstagramBioLink,
  getBioLinkActivationWindowEnd,
  isInstagramActivationSource,
  resolveBioLinkActivationStatus,
} from '@/lib/distribution/instagram-activation';

describe('instagram activation helpers', () => {
  it('builds the Instagram bio preset instead of the bare profile URL', () => {
    const url = new URL(buildInstagramBioLink('https://jov.ie/timwhite'));

    expect(url.origin + url.pathname).toBe('https://jov.ie/timwhite');
    expect(url.searchParams.get('utm_source')).toBe('instagram');
    expect(url.searchParams.get('utm_medium')).toBe('social');
    expect(url.searchParams.get('utm_content')).toBe('bio');
    expect(url.searchParams.get('utm_campaign')).toBe('timwhite');
  });

  it('detects Instagram activation from UTM source or Instagram referrers', () => {
    expect(
      isInstagramActivationSource({
        utmParams: { source: 'instagram' },
      })
    ).toBe(true);

    expect(
      isInstagramActivationSource({
        referrer: 'https://l.instagram.com/?u=https%3A%2F%2Fjov.ie%2Ftimwhite',
      })
    ).toBe(true);

    expect(
      isInstagramActivationSource({
        referrer: 'https://google.com/search?q=jovie',
        utmParams: { source: 'google' },
      })
    ).toBe(false);
  });

  it('resolves pending, activated, and expired activation states', () => {
    const onboardingCompletedAt = new Date('2026-04-01T00:00:00.000Z');
    const windowEndsAt = getBioLinkActivationWindowEnd(onboardingCompletedAt);

    expect(
      resolveBioLinkActivationStatus({
        activatedAt: null,
        now: new Date('2026-04-05T00:00:00.000Z'),
        windowEndsAt,
      })
    ).toBe('pending');

    expect(
      resolveBioLinkActivationStatus({
        activatedAt: new Date('2026-04-03T00:00:00.000Z'),
        now: new Date('2026-04-05T00:00:00.000Z'),
        windowEndsAt,
      })
    ).toBe('activated');

    expect(
      resolveBioLinkActivationStatus({
        activatedAt: null,
        now: new Date('2026-04-10T00:00:00.000Z'),
        windowEndsAt,
      })
    ).toBe('expired');
  });
});
