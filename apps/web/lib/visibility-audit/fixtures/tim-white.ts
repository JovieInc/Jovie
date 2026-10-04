import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import type { VisibilityAuditInput } from '../types';

/**
 * Tim White sample input.
 *
 * Evidence is limited to the in-repo verified profile (`lib/tim-white.ts`).
 * MBID, Wikidata, ISNI, link-in-bio pages, pixels, search rows, and citation
 * checks are absent here on purpose — the report records those gaps instead
 * of inventing a complete footprint. No live fetch.
 */
export const TIM_WHITE_VISIBILITY_AUDIT_INPUT: VisibilityAuditInput = {
  artistName: TIM_WHITE_PROFILE.name,
  profilePath: TIM_WHITE_PROFILE.publicProfilePath,
  profileUrl: TIM_WHITE_PROFILE.publicProfileUrl,
  musicbrainzId: null,
  spotifyUrl: TIM_WHITE_PROFILE.spotifyUrl,
  appleMusicUrl: null,
  youtubeUrl: null,
  identityLinks: [],
  socialLinks: [],
  dspLinks: [
    {
      platform: 'spotify',
      url: TIM_WHITE_PROFILE.spotifyUrl,
    },
  ],
  ingestedUrls: [],
  linkInBioOutbound: [],
  catalogMismatches: [],
  discoveredPixels: null,
  searchOwnership: [],
  citationChecks: [],
  generatedAt: '2026-10-02T00:00:00.000Z',
  evidenceNote:
    'Evidence is the in-repo verified profile for /tim. Live DSP, link-in-bio, pixel, search, and citation checks were not run. MusicFetch and SerpAPI were not called.',
};
