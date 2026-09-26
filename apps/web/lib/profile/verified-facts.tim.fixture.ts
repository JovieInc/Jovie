import type { ProfileFact } from './verified-facts';

/**
 * Bounded Tim White fixture for verified profile facts (JOV-6344).
 *
 * Only modest, attributable facts are marked verified+public. Prestige
 * claims from the originating conversation ('70 million streams', exits,
 * YC affiliation, chart placements, Grammy nominations) are illustrative
 * and intentionally non-eligible — they demonstrate omission, not
 * completeness.
 */

export const TIM_SUBJECT_ENTITY_ID = 'ent_tim_white';
const TIM = 'Tim White';

export const timProfileFacts: readonly ProfileFact[] = [
  {
    id: 'fact_tim_founded_jovie',
    subjectEntityId: TIM_SUBJECT_ENTITY_ID,
    subjectName: TIM,
    relation: 'founder',
    objectName: 'Jovie',
    phrase: 'is the founder of Jovie',
    claim: { label: 'founder of Jovie', value: 'founder' },
    evidence: [
      {
        sourceRecordId: 'src_jovie_founding_record',
        sourceType: 'manual',
        location: 'jovie-inc/company-record',
        note: 'Jovie company record naming Tim White as founder',
        visibility: 'public',
      },
    ],
    observedAt: '2026-09-16T00:00:00.000Z',
    verifiedAt: '2026-09-16T00:00:00.000Z',
    limitations: ['self-reported company role'],
    confidence: 'high',
    status: 'verified',
    publication: 'public',
    topics: ['press', 'investor', 'bio'],
  },
  {
    id: 'fact_tim_independent_artist',
    subjectEntityId: TIM_SUBJECT_ENTITY_ID,
    subjectName: TIM,
    relation: 'artist',
    phrase: 'releases music as an independent artist',
    claim: { label: 'active independent artist', value: 'independent artist' },
    evidence: [
      {
        sourceRecordId: 'src_tim_artist_profile',
        sourceType: 'web',
        location: 'public artist profile',
        note: 'public artist profile attributed to the same entity',
        visibility: 'public',
      },
    ],
    observedAt: '2026-09-16T00:00:00.000Z',
    verifiedAt: '2026-09-16T00:00:00.000Z',
    confidence: 'medium',
    status: 'verified',
    publication: 'public',
    topics: ['press', 'bio'],
  },
  {
    // Illustrative/unverified: kept in the set to prove omission.
    id: 'fact_tim_streams_70m',
    subjectEntityId: TIM_SUBJECT_ENTITY_ID,
    subjectName: TIM,
    phrase: 'has 70 million streams',
    claim: {
      label: 'all-time streams',
      value: 70_000_000,
      unit: 'streams',
    },
    evidence: [
      {
        sourceRecordId: 'src_conversation_claim',
        sourceType: 'chat_message',
        note: 'unverified conversational claim',
        visibility: 'private',
      },
    ],
    observedAt: '2026-09-16T00:00:00.000Z',
    confidence: 'low',
    status: 'candidate',
    publication: 'internal',
    aggregateKey: 'tim_all_time_streams',
    topics: ['press'],
  },
  {
    // Illustrative/unverified: Grammy attribution would not transfer to
    // every contributor even if the recording were nominated.
    id: 'fact_tim_grammy_nomination',
    subjectEntityId: TIM_SUBJECT_ENTITY_ID,
    subjectName: TIM,
    relation: 'contributor',
    phrase: 'is a Grammy-nominated songwriter',
    claim: { label: 'Grammy nominations', value: 1, unit: 'nominations' },
    evidence: [],
    observedAt: '2026-09-16T00:00:00.000Z',
    confidence: 'low',
    status: 'contradicted',
    publication: 'private',
    limitations: ['recording award does not transfer to every contributor'],
    topics: ['press'],
  },
];
