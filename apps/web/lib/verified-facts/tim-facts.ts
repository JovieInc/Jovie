import type { VerifiedFact } from './types';

/**
 * JOV-6344 — bounded, genuinely supportable facts about Tim White.
 *
 * Each fact cites the repo source record and exact location it rests on.
 * Claims like "70 million streams", exits, YC affiliation, chart placements,
 * and Grammy nominations are deliberately absent: they are unverified for
 * Tim and must not be manufactured for completeness.
 */

export const TIM_ENTITY_ID = 'ent_tim_white';
export const JOVIE_ENTITY_ID = 'ent_jovie';

export const TIM_VERIFIED_FACTS: readonly VerifiedFact[] = [
  {
    id: 'fact_tim_founder_jovie',
    subjectEntityId: TIM_ENTITY_ID,
    role: 'founder',
    claim: {
      kind: 'role',
      text: 'Tim White is the founder of Jovie.',
      scope: 'subject',
    },
    evidence: [
      {
        sourceRecordId: 'src_repo_canon_positioning',
        location:
          'canon/POSITIONING.md — "Owner: Tim White", founder-locked canon',
      },
    ],
    observedAt: '2026-08-17',
    verifiedAt: '2026-09-16',
    limitations: ['Founder role only; implies nothing about funding or exits.'],
    confidence: 'high',
    status: 'verified',
    publicationPermission: 'granted',
    approvedText: 'Tim White is the founder of Jovie.',
  },
  {
    id: 'fact_tim_recording_artist',
    subjectEntityId: TIM_ENTITY_ID,
    role: 'artist',
    claim: {
      kind: 'identity',
      text: 'Tim White releases music as the artist Tim White.',
      scope: 'subject',
    },
    evidence: [
      {
        sourceRecordId: 'src_repo_tim_white_profile',
        location: 'apps/web/lib/tim-white.ts — TIM_WHITE_PROFILE',
      },
      {
        sourceRecordId: 'src_repo_spotify_blacklist',
        location:
          'apps/web/lib/spotify/blacklist.ts — TIM_WHITE_SPOTIFY_ID artist id 4Uwpa6zW3zzCSQvooQNksm',
      },
    ],
    observedAt: '2026-09-16',
    verifiedAt: '2026-09-16',
    limitations: [
      'Stream counts, chart placements, and awards are not independently verified.',
    ],
    confidence: 'high',
    status: 'verified',
    publicationPermission: 'granted',
    approvedText: 'Tim White is a recording artist.',
  },
  {
    id: 'fact_tim_public_profile',
    subjectEntityId: TIM_ENTITY_ID,
    role: 'profile-subject',
    claim: {
      kind: 'relationship',
      text: 'His public Jovie artist profile lives at jov.ie/tim.',
      scope: 'subject',
    },
    evidence: [
      {
        sourceRecordId: 'src_repo_tim_white_profile',
        location:
          'apps/web/lib/tim-white.ts — publicProfileUrl https://jov.ie/tim',
      },
    ],
    observedAt: '2026-09-16',
    verifiedAt: '2026-09-16',
    limitations: [],
    confidence: 'high',
    status: 'verified',
    publicationPermission: 'granted',
  },
];

/** Organization-scoped descriptor — belongs to Jovie, not to Tim. */
export const JOVIE_FACTS: readonly VerifiedFact[] = [
  {
    id: 'fact_jovie_positioning',
    subjectEntityId: JOVIE_ENTITY_ID,
    role: 'product',
    claim: {
      kind: 'identity',
      text: "Jovie is the creator's always-on creative and business partner.",
      scope: 'organization',
    },
    evidence: [
      {
        sourceRecordId: 'src_repo_canon_positioning',
        location: 'canon/POSITIONING.md — locked one-sentence positioning',
      },
    ],
    observedAt: '2026-08-17',
    verifiedAt: '2026-09-16',
    limitations: ['Positioning canon; not a performance claim.'],
    confidence: 'high',
    status: 'verified',
    publicationPermission: 'granted',
  },
];
