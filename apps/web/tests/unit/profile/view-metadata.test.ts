import { describe, expect, it } from 'vitest';
import { buildViewMetadata } from '@/features/profile/views/metadata';

const BASELINE = {
  artistName: 'The Weeknd',
  artistHandle: 'theweeknd',
  baseUrl: 'https://jov.ie',
};

describe('buildViewMetadata', () => {
  it('canonicalizes the base profile to /<handle>', () => {
    const meta = buildViewMetadata('profile', BASELINE);
    expect(meta.alternates?.canonical).toBe('https://jov.ie/theweeknd');
  });

  it('canonicalizes routed modes to /<handle>/<mode>', () => {
    for (const mode of [
      'listen',
      'subscribe',
      'pay',
      'contact',
      'about',
      'tour',
      'releases',
      'share',
      'menu',
    ] as const) {
      const meta = buildViewMetadata(mode, BASELINE);
      expect(meta.alternates?.canonical, `canonical for ${mode}`).toBe(
        `https://jov.ie/theweeknd/${mode}`
      );
    }
  });

  it('tolerates a trailing slash on the base url', () => {
    const meta = buildViewMetadata('listen', {
      ...BASELINE,
      baseUrl: 'https://jov.ie/',
    });
    expect(meta.alternates?.canonical).toBe('https://jov.ie/theweeknd/listen');
  });

  it('titles routed modes mode-first so the URL-tab scan target is the intent', () => {
    expect(buildViewMetadata('listen', BASELINE).title).toBe(
      'Listen · The Weeknd · Jovie'
    );
    expect(buildViewMetadata('pay', BASELINE).title).toBe(
      'Pay · The Weeknd · Jovie'
    );
    // Base profile is artist-first.
    expect(buildViewMetadata('profile', BASELINE).title).toBe(
      'The Weeknd · Jovie'
    );
  });

  it('pulls descriptions from the registry subtitle when present', () => {
    expect(buildViewMetadata('listen', BASELINE).description).toBe(
      'Stream or download on your favorite platform.'
    );
    expect(buildViewMetadata('subscribe', BASELINE).description).toBe(
      'Get notified about new releases and shows.'
    );
  });

  it('falls back to a generic description when the view has no subtitle', () => {
    // `menu` and `profile` have no subtitle in the registry.
    expect(buildViewMetadata('menu', BASELINE).description).toBe(
      'The Weeknd on Jovie.'
    );
    expect(buildViewMetadata('profile', BASELINE).description).toBe(
      'The Weeknd on Jovie.'
    );
  });

  it('mirrors canonical into the OG url so share previews match the route', () => {
    const meta = buildViewMetadata('pay', BASELINE);
    expect(meta.openGraph?.url).toBe('https://jov.ie/theweeknd/pay');
  });
});
