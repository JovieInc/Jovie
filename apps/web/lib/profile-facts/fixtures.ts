import { generateProfileCopy, recordDerivative } from './generate';
import type {
  DerivativeRecord,
  GeneratedProfileCopy,
  ProfileFact,
  SubjectRef,
} from './types';

/**
 * Bounded, genuinely supportable Tim White facts (JOV-6344 demonstration
 * slice). Source record ids are fixture stand-ins for `memory_source_records`
 * rows; each fact binds subject, claim, evidence, dates, permission, and
 * status. The conversation's "70 million streams", exits, YC affiliation,
 * chart placements, and Grammy nominations are illustrative/unverified and
 * appear only as omitted candidates.
 */

export const TIM_SUBJECT_ENTITY_ID = 'ent_fixture_tim_white';
export const OTHER_TIM_SUBJECT_ENTITY_ID = 'ent_fixture_tim_white_other';

export const timSubjects: readonly SubjectRef[] = [
  {
    entityId: TIM_SUBJECT_ENTITY_ID,
    name: 'Tim White',
    aliases: ['Timothy White', 'timwhite'],
    status: 'confirmed',
  },
  {
    entityId: OTHER_TIM_SUBJECT_ENTITY_ID,
    name: 'Tim White',
    aliases: ['Tim White (golfer)'],
    status: 'confirmed',
  },
];

const src = (sourceRecordId: string, locator: string) => ({
  sourceRecordId,
  locator,
  observedAt: '2026-09-16T00:00:00Z',
});

export const timFacts: readonly ProfileFact[] = [
  {
    id: 'fact_tim_founder_jovie',
    subjectEntityId: TIM_SUBJECT_ENTITY_ID,
    kind: 'role',
    role: 'founder',
    claim: 'Tim White is the founder of Jovie',
    evidence: [
      src(
        'sr_fixture_canon_os',
        'canon/OPERATING_SYSTEM.md — Owner: Tim White'
      ),
    ],
    verifiedAt: '2026-09-16T00:00:00Z',
    confidence: 'high',
    status: 'verified',
    permission: 'public',
  },
  {
    id: 'fact_tim_artist',
    subjectEntityId: TIM_SUBJECT_ENTITY_ID,
    kind: 'identity',
    claim: 'Tim White records and releases music as an artist',
    evidence: [
      src('sr_fixture_spotify_identity', 'spotify artist identity record'),
    ],
    verifiedAt: '2026-09-16T00:00:00Z',
    confidence: 'high',
    status: 'verified',
    permission: 'public',
  },
  {
    id: 'fact_jovie_platform',
    subjectEntityId: TIM_SUBJECT_ENTITY_ID,
    kind: 'affiliation',
    role: 'founder',
    claim: 'Jovie is a music marketing and link-in-bio platform for artists',
    evidence: [src('sr_fixture_positioning', 'canon/POSITIONING.md')],
    verifiedAt: '2026-09-16T00:00:00Z',
    confidence: 'high',
    status: 'verified',
    permission: 'public',
  },
  // Illustrative/unverified: must be omitted, never completed.
  {
    id: 'fact_tim_streams_unverified',
    subjectEntityId: TIM_SUBJECT_ENTITY_ID,
    kind: 'metric',
    claim: 'Tim White has 70 million streams',
    value: 70_000_000,
    unit: 'streams',
    window: 'lifetime',
    evidence: [],
    confidence: 'low',
    status: 'candidate',
    permission: 'public',
    limitations: 'Overlapping stream sources would double-count; unverified.',
  },
  // Verified but private: must never reach public copy.
  {
    id: 'fact_tim_private_note',
    subjectEntityId: TIM_SUBJECT_ENTITY_ID,
    kind: 'relationship',
    claim: 'Private planning note from a founder interview',
    evidence: [src('sr_fixture_private_memo', 'internal founder memo')],
    verifiedAt: '2026-09-16T00:00:00Z',
    confidence: 'high',
    status: 'verified',
    permission: 'private',
  },
];

/** The demo boilerplate: every sentence traces to a fact id. */
export const timBoilerplate: GeneratedProfileCopy = generateProfileCopy({
  subjectEntityId: TIM_SUBJECT_ENTITY_ID,
  facts: timFacts,
  audience: 'press',
});

export const timBoilerplateRecord: DerivativeRecord = recordDerivative({
  id: 'deriv_tim_boilerplate_v1',
  kind: 'boilerplate',
  copy: timBoilerplate,
  generatedAt: '2026-09-16T00:00:00Z',
});
