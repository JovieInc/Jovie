import { TIM_WHITE_SPOTIFY_ID } from '@/lib/spotify/blacklist';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { generateProfileCopy } from './generate';
import type { GeneratedCopy, ProfileFact, SubjectEntity } from './types';

// Bounded set of genuinely supportable Tim White facts (JOV-6344), each
// anchored to in-repo evidence. Illustrative but unverified claims (stream
// totals, exits, YC, charts, Grammys) are deliberately absent — omission,
// not manufactured completeness.

export const TIM_WHITE_ENTITY_ID = 'person:tim-white';

export const TIM_WHITE_SUBJECT: SubjectEntity = {
  entityId: TIM_WHITE_ENTITY_ID,
  name: TIM_WHITE_PROFILE.name,
  aliases: [TIM_WHITE_PROFILE.handle, 'tim'],
  identifiers: {
    spotifyArtistId: TIM_WHITE_SPOTIFY_ID,
    profilePath: TIM_WHITE_PROFILE.publicProfilePath,
  },
};

const REPO_TIM_WHITE = 'apps/web/lib/tim-white.ts';
const REPO_BLACKLIST = 'apps/web/lib/spotify/blacklist.ts';
const OBSERVED_AT = '2026-09-26';

export const TIM_WHITE_FACTS: readonly ProfileFact[] = [
  {
    id: 'fact:tim-founder-of-jovie',
    subjectEntityId: TIM_WHITE_ENTITY_ID,
    claim: {
      kind: 'role',
      predicate: 'founder-of',
      value: 'founder',
      qualifier: 'Jovie',
    },
    sources: [
      {
        location: REPO_BLACKLIST,
        refs: ['TIM_WHITE_SPOTIFY_ID: "Tim White (founder)"'],
        observedAt: OBSERVED_AT,
        verifiedAt: OBSERVED_AT,
      },
    ],
    limitations: ['founder vs. sole-founder scope is not evidenced'],
    confidence: 0.95,
    status: 'verified',
    approval: {
      approved: true,
      approvedWording: 'Tim White is a founder of Jovie.',
      decidedBy: 'tim',
      decidedAt: OBSERVED_AT,
    },
    permission: { scope: 'public', grantedAt: OBSERVED_AT },
  },
  {
    id: 'fact:tim-recording-artist',
    subjectEntityId: TIM_WHITE_ENTITY_ID,
    claim: {
      kind: 'role',
      predicate: 'recording-artist',
      value: 'recording artist',
    },
    sources: [
      {
        location: REPO_BLACKLIST,
        refs: [`canonical Spotify id ${TIM_WHITE_SPOTIFY_ID}`],
        observedAt: OBSERVED_AT,
        verifiedAt: OBSERVED_AT,
      },
    ],
    limitations: ['catalog size and genre are not evidenced here'],
    confidence: 0.95,
    status: 'verified',
    approval: {
      approved: true,
      approvedWording: 'He releases music as Tim White.',
      decidedBy: 'tim',
      decidedAt: OBSERVED_AT,
    },
    permission: { scope: 'public', grantedAt: OBSERVED_AT },
  },
  {
    id: 'fact:tim-public-profile',
    subjectEntityId: TIM_WHITE_ENTITY_ID,
    claim: {
      kind: 'identifier',
      predicate: 'public-profile',
      value: TIM_WHITE_PROFILE.publicProfileDisplay,
    },
    sources: [
      {
        location: REPO_TIM_WHITE,
        refs: ['publicProfileUrl'],
        observedAt: OBSERVED_AT,
        verifiedAt: OBSERVED_AT,
      },
    ],
    limitations: [],
    confidence: 1,
    status: 'verified',
    approval: { approved: true, decidedBy: 'tim', decidedAt: OBSERVED_AT },
    permission: { scope: 'public', grantedAt: OBSERVED_AT },
  },
  {
    // Candidate only: provenance is a demo fixture, not independent evidence.
    // Demonstrates omission rather than completeness-by-invention.
    id: 'fact:tim-cosmic-gate-collab',
    subjectEntityId: TIM_WHITE_ENTITY_ID,
    claim: {
      kind: 'relationship',
      predicate: 'collaborated-with',
      value: 'Cosmic Gate',
    },
    sources: [
      {
        location: 'apps/web/lib/demo-founder-video.ts',
        refs: ['meta: "Tim White x Cosmic Gate"'],
        observedAt: OBSERVED_AT,
      },
    ],
    limitations: ['single-source product fixture; not verified'],
    confidence: 0.5,
    status: 'candidate',
    approval: { approved: false },
    permission: { scope: 'private' },
  },
];

// Reusable press boilerplate: same eligible facts as profile/pitch, with
// sentence-to-evidence traceability in `sentences[].factIds`.
export function timWhiteBoilerplate(): GeneratedCopy {
  return generateProfileCopy({
    subject: TIM_WHITE_SUBJECT,
    facts: TIM_WHITE_FACTS,
    surface: 'boilerplate',
  });
}
