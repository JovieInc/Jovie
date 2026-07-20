import { describe, expect, it } from 'vitest';
import { buildSurfaceCandidates } from '@/lib/profile-surfaces/candidates';

const emptyInput = {
  profile: {
    id: '11111111-1111-4111-8111-111111111111',
    username: 'tim',
    displayName: 'Tim White',
  },
  publicProfileBaseUrl: 'https://jov.ie',
  socials: [],
  dspMatches: [],
  identityLinks: [],
} as const;

describe('buildSurfaceCandidates', () => {
  it('always creates one qualified Jovie surface', () => {
    expect(buildSurfaceCandidates(emptyInput)).toEqual([
      expect.objectContaining({
        kind: 'jovie',
        platform: 'jovie',
        url: 'https://jov.ie/tim',
        qualificationStatus: 'qualified',
        isOfficial: true,
      }),
    ]);
  });

  it('classifies official websites, DSPs, socials, and authority sources', () => {
    const surfaces = buildSurfaceCandidates({
      ...emptyInput,
      socials: [
        {
          id: 'social-website',
          platform: 'website',
          platformType: 'website',
          displayText: 'Official site',
          url: 'https://timwhite.com',
          confidence: '1.00',
          sortOrder: 1,
        },
        {
          id: 'social-instagram',
          platform: 'instagram',
          platformType: 'social',
          displayText: '@timwhite',
          url: 'https://instagram.com/timwhite',
          confidence: '0.99',
          sortOrder: 2,
        },
      ],
      dspMatches: [
        {
          id: 'dsp-spotify',
          providerId: 'spotify',
          externalArtistName: 'Tim White',
          externalArtistUrl: 'https://open.spotify.com/artist/abc',
          externalArtistId: 'abc',
          confidenceScore: '0.98',
        },
      ],
      identityLinks: [
        {
          id: 'identity-wikipedia',
          platform: 'wikipedia',
          url: 'https://en.wikipedia.org/wiki/Tim_White',
          externalId: null,
        },
      ],
    });

    expect(surfaces.map(surface => [surface.platform, surface.kind])).toEqual([
      ['jovie', 'jovie'],
      ['website', 'website'],
      ['instagram', 'social'],
      ['spotify', 'dsp'],
      ['wikipedia', 'authority'],
    ]);
    expect(surfaces.at(-1)?.qualificationStatus).toBe('suggested');
  });

  it('merges provenance and prefers qualified evidence for one URL', () => {
    const surfaces = buildSurfaceCandidates({
      ...emptyInput,
      socials: [
        {
          id: 'social-instagram',
          platform: 'instagram',
          platformType: 'social',
          displayText: '@timwhite',
          url: 'https://www.instagram.com/timwhite/?utm_source=jovie',
          confidence: '0.99',
          sortOrder: 1,
        },
      ],
      identityLinks: [
        {
          id: 'identity-instagram',
          platform: 'instagram',
          url: 'https://instagram.com/timwhite',
          externalId: null,
        },
      ],
    });

    const instagram = surfaces.find(
      surface => surface.platform === 'instagram'
    );
    expect(instagram).toMatchObject({
      qualificationStatus: 'qualified',
      normalizedUrl: 'https://instagram.com/timwhite',
      isOfficial: true,
    });
    expect(instagram?.sources).toHaveLength(2);
  });

  it('skips invalid and incomplete destinations', () => {
    const surfaces = buildSurfaceCandidates({
      ...emptyInput,
      socials: [
        {
          id: 'bad-social',
          platform: 'instagram',
          platformType: 'social',
          displayText: null,
          url: 'javascript:alert(1)',
          confidence: '0.50',
          sortOrder: null,
        },
      ],
      dspMatches: [
        {
          id: 'missing-dsp-url',
          providerId: 'spotify',
          externalArtistName: 'Tim White',
          externalArtistUrl: null,
          externalArtistId: 'abc',
          confidenceScore: null,
        },
      ],
    });

    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]?.kind).toBe('jovie');
  });
});
