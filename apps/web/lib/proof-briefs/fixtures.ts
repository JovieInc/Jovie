import type { BriefRequest, ProofEvent } from './types';

/**
 * Proof-brief fixtures (JOV-7216): the two acceptance briefs — Jovie
 * company/investor dogfood and Tim's artist/customer proof account — plus
 * negative fixtures that must be rejected or rewritten by certification.
 */

export const JOVIE_ENTITY_ID = 'ent_jovie_company';
export const TIM_ARTIST_ENTITY_ID = 'ent_tim_white_artist';
export const AS_OF = '2026-09-29';
const DAY = 24 * 60 * 60 * 1000;
const isoDaysAgo = (days: number) =>
  new Date(Date.parse(AS_OF) - days * DAY).toISOString().slice(0, 10);

export function makeEvent(
  o: Partial<ProofEvent> & Pick<ProofEvent, 'id' | 'did' | 'subjectEntityId'>
): ProofEvent {
  return {
    revision: 'r1',
    subjectName: 'Jovie',
    status: 'verified',
    attribution: 'none',
    observedAt: isoDaysAgo(1),
    disclosure: 'public',
    audienceRelevance: {},
    limitations: [],
    ...o,
  };
}

// --- Jovie company dogfood (investor-facing variant) ---

export const JOVIE_EVENTS: readonly ProofEvent[] = [
  makeEvent({
    id: 'ev-jov-load-time',
    revision: 'r3',
    subjectEntityId: JOVIE_ENTITY_ID,
    did: 'shipped a faster public artist page',
    changed: 'median load time fell from 420 ms to 310 ms over 7d',
    attribution: 'direct',
    metric: {
      predicate: 'p50-load-ms',
      label: 'Median load time',
      before: 420,
      after: 310,
      unit: 'ms',
      window: '7d',
    },
    observedAt: isoDaysAgo(1),
    audienceRelevance: { investor: 0.9, founder: 0.8, internal: 0.8 },
  }),
  makeEvent({
    id: 'ev-jov-waitlist-gate',
    revision: 'r1',
    subjectEntityId: JOVIE_ENTITY_ID,
    did: 'gated waitlist auto-admission on open cohort learnings and artist ICP fit',
    attribution: 'none',
    observedAt: isoDaysAgo(2),
    audienceRelevance: { investor: 0.7, founder: 0.9, internal: 0.6 },
    approvedWording:
      'New artists now join through a gated waitlist, so early cohorts stay close to the people the product serves best.',
  }),
  makeEvent({
    id: 'ev-jov-proof-claim',
    revision: 'r2',
    subjectEntityId: JOVIE_ENTITY_ID,
    did: 'fixed the proof-claim button so it stays clear of the consent card',
    attribution: 'direct',
    observedAt: isoDaysAgo(3),
    audienceRelevance: { investor: 0.45, founder: 0.4, internal: 0.5 },
  }),
  makeEvent({
    id: 'ev-jov-churn-detail',
    revision: 'r1',
    subjectEntityId: JOVIE_ENTITY_ID,
    did: 'reviewed churned artist accounts for onboarding friction',
    attribution: 'correlated',
    disclosure: 'internal',
    observedAt: isoDaysAgo(2),
    audienceRelevance: { investor: 0.8, founder: 0.9, internal: 0.9 },
  }),
];

export const JOVIE_INVESTOR_REQUEST: BriefRequest = {
  audience: 'investor',
  subjectEntityId: JOVIE_ENTITY_ID,
  windowDays: 7,
  asOf: AS_OF,
  disclosureScope: 'public',
};

// --- Tim's artist / customer proof account ---

export const TIM_EVENTS: readonly ProofEvent[] = [
  makeEvent({
    id: 'ev-tim-one-link',
    revision: 'r2',
    subjectEntityId: TIM_ARTIST_ENTITY_ID,
    subjectName: 'Tim White',
    did: 'set up your profile as one page for streaming, merch and updates',
    attribution: 'direct',
    observedAt: isoDaysAgo(1),
    disclosure: 'private',
    audienceRelevance: { customer: 0.95, manager: 0.6 },
    approvedWording:
      'Your profile now gives fans one place to stream, buy and get updates.',
  }),
  makeEvent({
    id: 'ev-tim-profile-views',
    revision: 'r1',
    subjectEntityId: TIM_ARTIST_ENTITY_ID,
    subjectName: 'Tim White',
    did: 'kept your profile link live',
    changed: 'profile visits rose from 120 to 180 over 7d',
    attribution: 'correlated',
    metric: {
      predicate: 'profile-visits',
      label: 'Profile visits',
      before: 120,
      after: 180,
      window: '7d',
    },
    limitations: ['Visits include repeat views from the same fans.'],
    observedAt: isoDaysAgo(2),
    disclosure: 'private',
    audienceRelevance: { customer: 0.6, manager: 0.7 },
  }),
];

export const TIM_CUSTOMER_REQUEST: BriefRequest = {
  audience: 'customer',
  subjectEntityId: TIM_ARTIST_ENTITY_ID,
  windowDays: 7,
  asOf: AS_OF,
  disclosureScope: 'private',
};

// --- Negative fixtures (must be rejected or rewritten) ---

/** True but written in internal jargon. */
export const JARGON_EVENT = makeEvent({
  id: 'ev-neg-jargon',
  subjectEntityId: JOVIE_ENTITY_ID,
  did: 'refactored the routing layer',
  attribution: 'direct',
  audienceRelevance: { investor: 0.9, internal: 0.9 },
  approvedWording: 'Implemented normalized destination routing primitives.',
});

/** Unsupported causal language on correlated evidence. */
export const OVERCLAIM_EVENT = makeEvent({
  id: 'ev-neg-overclaim',
  subjectEntityId: JOVIE_ENTITY_ID,
  did: 'shipped a faster public artist page',
  changed: 'signups moved during the same week',
  attribution: 'correlated',
  audienceRelevance: { investor: 0.9, internal: 0.9 },
  approvedWording: 'The faster page drove a 40% lift in signups.',
});

/** Verified but outside the requested 7-day window. */
export const STALE_EVENT = makeEvent({
  id: 'ev-neg-stale',
  subjectEntityId: JOVIE_ENTITY_ID,
  did: 'shipped a faster public artist page',
  attribution: 'direct',
  observedAt: isoDaysAgo(30),
  audienceRelevance: { investor: 0.9, internal: 0.9 },
});

/** Conflicting metric: same predicate, different verified value. */
export const CONFLICTING_METRIC_EVENT = makeEvent({
  id: 'ev-neg-conflict',
  subjectEntityId: JOVIE_ENTITY_ID,
  status: 'contradicted',
  did: 'measured median load time',
  attribution: 'none',
  metric: {
    predicate: 'p50-load-ms',
    label: 'Median load time',
    before: 420,
    after: 900,
    unit: 'ms',
    window: '7d',
  },
  observedAt: isoDaysAgo(1),
  audienceRelevance: { investor: 0.5 },
});

/** Private customer data that must never reach an investor/public brief. */
export const PRIVATE_LEAK_EVENT = makeEvent({
  id: 'ev-neg-private',
  subjectEntityId: TIM_ARTIST_ENTITY_ID,
  subjectName: 'Tim White',
  did: 'earned $12,400 from a private brand deal',
  attribution: 'direct',
  disclosure: 'private',
  audienceRelevance: { investor: 0.95, customer: 0.9 },
});

/** Low-relevance items that exist only to fill three bullets. */
export const FILLER_EVENTS: readonly ProofEvent[] = [
  makeEvent({
    id: 'ev-neg-filler-1',
    subjectEntityId: JOVIE_ENTITY_ID,
    did: 'renamed an internal config flag',
    audienceRelevance: { investor: 0.2, internal: 0.4 },
  }),
  makeEvent({
    id: 'ev-neg-filler-2',
    subjectEntityId: JOVIE_ENTITY_ID,
    did: 'tidied a test helper',
    audienceRelevance: { investor: 0.1, internal: 0.3 },
  }),
];
