/** Bounded, attributable Tim White facts (JOV-6344). The 70M-streams and
 * Grammy fixtures are intentionally unverified — they prove withholding. */
import type { ProfileFact } from './verified-facts';

export const TIM_SUBJECT_ENTITY_ID = 'entity-tim-white-artist';

const ev = (locator: string) => [
  {
    sourceRecordId: `src-${locator.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
    locator,
  },
];

const base = {
  subjectEntityId: TIM_SUBJECT_ENTITY_ID,
  subjectStatus: 'confirmed',
  observedAt: '2026-08-13',
  verifiedAt: '2026-09-16',
  confidence: 'high',
  status: 'verified',
  publication: 'public',
} as const;

export const TIM_FOUNDER_FACT: ProfileFact = {
  ...base,
  id: 'fact-tim-founder-of-jovie',
  kind: 'role',
  predicate: 'founder_of',
  object: 'Jovie',
  claim: 'Tim White is the founder of Jovie.',
  evidence: ev('docs/OVIE_MCP.md'),
};

export const TIM_ARTIST_PROFILE_FACT: ProfileFact = {
  ...base,
  id: 'fact-tim-artist-profile',
  kind: 'profile',
  predicate: 'has_profile',
  claim:
    'Tim White is a recording artist with a public Jovie profile at jov.ie/tim.',
  evidence: ev('apps/web/lib/tim-white.ts'),
};

export const TIM_NSAW_CREDIT_FACT: ProfileFact = {
  ...base,
  id: 'fact-tim-nsaw-credit',
  kind: 'release_credit',
  predicate: 'artist_on',
  object: "the single 'Never Say A Word' (2024-06-21)",
  claim:
    "Tim White is credited as artist on the single 'Never Say A Word', released 2024-06-21.",
  evidence: ev('docs/playbooks/jovie-release-planner.playbook.md'),
};

export const TIM_CATALOG_COUNT_FACT: ProfileFact = {
  ...base,
  id: 'fact-tim-catalog-singles',
  kind: 'metric',
  predicate: 'released',
  object: "Tim White's catalog",
  value: 18,
  unit: 'singles',
  window: 'as of 2026-08',
  claim: "Tim White's catalog lists 18 historical singles as of 2026-08.",
  evidence: ev('docs/playbooks/jovie-release-planner.playbook.md'),
  limitations: ['Internal dogfooding count; not independently audited.'],
  confidence: 'medium',
};

/** Real evidence, but publication not permitted. */
export const TIM_PRIVATE_NOTE_FACT: ProfileFact = {
  ...base,
  id: 'fact-tim-private-note',
  kind: 'role',
  predicate: 'founder_of',
  object: 'Jovie',
  claim: 'Private founder-correspondence detail.',
  evidence: ev('gmail-message-fixture'),
  publication: 'none',
};

// --- Illustrative claims from the brief; withheld, never emitted. ---

export const UNVERIFIED_70M_STREAMS: ProfileFact = {
  ...base,
  id: 'fact-tim-70m-streams',
  kind: 'metric',
  predicate: 'streams_of',
  object: "Tim White's catalog",
  value: 70_000_000,
  unit: 'streams',
  window: 'lifetime',
  claim: "Tim White's catalog has 70 million lifetime streams.",
  evidence: ev('conversation-transcript'),
  verifiedAt: undefined,
  limitations: [
    'No platform evidence.',
    'May double-count overlapping DSP sources.',
  ],
  confidence: 'low',
  status: 'candidate',
};

export const WRONG_PERSON_GRAMMY: ProfileFact = {
  ...base,
  id: 'fact-other-tim-grammy',
  subjectEntityId: 'entity-tim-white-other',
  subjectStatus: 'candidate',
  kind: 'award',
  predicate: 'nominated_for',
  object: 'a Grammy',
  claim: 'A recording credited to "Tim White" was nominated for a Grammy.',
  evidence: ev('web-search-fixture'),
  verifiedAt: undefined,
  limitations: [
    'Multiple artists named Tim White; attribution unresolved.',
    'Recording-level award does not extend to every contributor.',
  ],
  confidence: 'low',
  status: 'candidate',
};

export const TIM_FACTS_FIXTURE: readonly ProfileFact[] = [
  TIM_FOUNDER_FACT,
  TIM_ARTIST_PROFILE_FACT,
  TIM_NSAW_CREDIT_FACT,
  TIM_CATALOG_COUNT_FACT,
  TIM_PRIVATE_NOTE_FACT,
  UNVERIFIED_70M_STREAMS,
  WRONG_PERSON_GRAMMY,
];
