import { describe, expect, it } from 'vitest';
import {
  enrichmentQualificationPatch,
  isAllowedEnrichmentSocialUrl,
  resolvePrimarySocialUrlForWaitlist,
} from './post-keep-enrichment-notes';

describe('post-keep enrichment notes (pure)', () => {
  it('accepts https Instagram and TikTok profile URLs', () => {
    expect(
      isAllowedEnrichmentSocialUrl(
        'https://www.instagram.com/wattwhite',
        'instagram'
      )
    ).toBe(true);
    expect(
      isAllowedEnrichmentSocialUrl(
        'https://www.tiktok.com/@wattwhite',
        'tiktok'
      )
    ).toBe(true);
    expect(
      isAllowedEnrichmentSocialUrl('https://evil.example/x', 'instagram')
    ).toBe(false);
  });

  it('prefers enrichment URL over Spotify fallback when allowed', () => {
    expect(
      resolvePrimarySocialUrlForWaitlist({
        fallbackUrl: 'https://open.spotify.com/artist/abc',
        enrichment: {
          platform: 'instagram',
          socialUrl: 'https://instagram.com/wattwhite',
        },
      })
    ).toBe('https://instagram.com/wattwhite');
  });

  it('falls back when enrichment URL is missing or disallowed', () => {
    expect(
      resolvePrimarySocialUrlForWaitlist({
        fallbackUrl: 'https://open.spotify.com/artist/abc',
        enrichment: { platform: 'instagram' },
      })
    ).toBe('https://open.spotify.com/artist/abc');
    expect(
      resolvePrimarySocialUrlForWaitlist({
        fallbackUrl: 'https://open.spotify.com/artist/abc',
        enrichment: {
          platform: 'instagram',
          socialUrl: 'https://evil.example/x',
        },
      })
    ).toBe('https://open.spotify.com/artist/abc');
  });

  it('builds qualification patch only when a note exists', () => {
    expect(enrichmentQualificationPatch(null)).toBeNull();
    expect(
      enrichmentQualificationPatch({
        platform: 'tiktok',
        audienceBand: 'under_500',
      })
    ).toEqual({
      postKeepEnrichment: expect.objectContaining({
        platform: 'tiktok',
        audienceBand: 'under_500',
      }),
    });
  });
});
