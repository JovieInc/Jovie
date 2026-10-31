/**
 * Artist memory contract (Tim, 2026-10-29): one canonical store of everything
 * Jovie knows about an artist, replacing bespoke editors (career highlights
 * textarea, press kit, YouTube ledger) with one "What Jovie knows" surface and
 * generated views.
 *
 * Every fact carries provenance, confidence, visibility and a review state.
 * Jovie learns facts and asks the artist to confirm in one tap; the artist
 * never has to fill a form.
 *
 * Alignment with sibling contracts:
 * - fact keys reuse verify-everything fact ids (`artist.bio`, `artist.press`,
 *   `work.isrc`, ...) so coverage and memory measure the same facts;
 * - `MemoryProvenance` is the `jovie.entity-resolver/v1` Provenance shape
 *   (sourceId, method, observedAt) plus an optional private source reference;
 * - owner actions emit resolver feedback signals (owner_confirmed,
 *   owner_rejected, user_correction) so sources get re-weighted;
 * - the display rule matches verify-everything: verified at or above the
 *   floor shows, anything unsure asks for one-tap confirm, missing hides.
 *
 * Pure module: no I/O, no clocks (callers pass `now`).
 */
import { z } from 'zod';

export const ARTIST_MEMORY_CONTRACT = 'jovie.artist-memory/v1' as const;

/** Default confidence floor for showing an unconfirmed fact as true. */
export const DEFAULT_MIN_CONFIDENCE = 0.85;

export const memoryFactKinds = [
  'identity',
  'catalog',
  'credit',
  'career',
  'press',
  'bio',
  'preference',
  'learned',
] as const;
export type MemoryFactKind = (typeof memoryFactKinds)[number];

/**
 * private: only the artist (and their team) sees it.
 * agents: also readable by Jovie agents and authorized third-party agents (API/MCP).
 * public: may render on the public profile and generated outputs (press kit, EPK).
 * Each level includes the ones before it.
 */
export const memoryVisibilities = ['private', 'agents', 'public'] as const;
export type MemoryVisibility = (typeof memoryVisibilities)[number];

/**
 * verified: passed a source verification rule (resolver/connector).
 * found: Jovie holds a value that has not been verified or confirmed.
 * confirmed: the artist confirmed it in one tap (or typed it themselves).
 * corrected: the artist replaced Jovie's value.
 * hidden: true, but the artist does not want it used anywhere.
 * rejected: the artist said it is wrong; kept as negative evidence.
 */
export const memoryReviewStates = [
  'verified',
  'found',
  'confirmed',
  'corrected',
  'hidden',
  'rejected',
] as const;
export type MemoryReviewState = (typeof memoryReviewStates)[number];

export const memoryOrigins = [
  'resolver',
  'connector',
  'conversation',
  'artist',
  'import',
] as const;
export type MemoryOrigin = (typeof memoryOrigins)[number];

const jsonValue = z.json();

export const memoryProvenanceSchema = z.strictObject({
  sourceId: z.string().min(1).max(128),
  method: z.string().min(1).max(128),
  observedAt: z.iso.datetime({ offset: true }).nullable(),
  /** Private pointer to the evidence (chat message, source record). Never projected outside the owner. */
  sourceRef: z
    .strictObject({
      kind: z.string().min(1).max(64),
      id: z.string().min(1).max(256),
    })
    .nullable()
    .optional(),
});
export type MemoryProvenance = z.infer<typeof memoryProvenanceSchema>;

export const artistMemoryFactSchema = z.strictObject({
  contract: z.literal(ARTIST_MEMORY_CONTRACT),
  id: z.string().min(1).max(256),
  profileId: z.string().min(1).max(128),
  /** Stable fact key, aligned to verify-everything ids; learned facts use `artist.learned.<slug>`. */
  key: z
    .string()
    .regex(/^(artist|work)\.[a-z0-9_.]+$/)
    .max(128),
  kind: z.enum(memoryFactKinds),
  label: z.string().min(1).max(120),
  value: jsonValue,
  /** One-line human rendering of the value, used in lists and generated views. */
  display: z.string().max(2000),
  provenance: z.array(memoryProvenanceSchema).min(1).max(20),
  confidence: z.number().min(0).max(1).nullable(),
  visibility: z.enum(memoryVisibilities),
  review: z.enum(memoryReviewStates),
  origin: z.enum(memoryOrigins),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type ArtistMemoryFact = z.infer<typeof artistMemoryFactSchema>;

export type MemoryFactDisplay = 'show' | 'confirm_one_tap' | 'hide';

/**
 * Never show an unsure fact as if it were true. Owner-reviewed facts show;
 * verified facts show at or above the floor; everything else that exists asks
 * for one tap; hidden and rejected facts never render.
 */
export function memoryFactDisplay(
  fact: Pick<ArtistMemoryFact, 'review' | 'confidence'>,
  minConfidence: number = DEFAULT_MIN_CONFIDENCE
): MemoryFactDisplay {
  switch (fact.review) {
    case 'confirmed':
    case 'corrected':
      return 'show';
    case 'verified':
      return fact.confidence === null || fact.confidence >= minConfidence
        ? 'show'
        : 'confirm_one_tap';
    case 'found':
      return 'confirm_one_tap';
    case 'hidden':
    case 'rejected':
      return 'hide';
  }
}

export const memoryActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('confirm') }),
  z.strictObject({
    type: z.literal('correct'),
    value: jsonValue,
    display: z.string().min(1).max(2000),
  }),
  z.strictObject({ type: z.literal('hide') }),
  z.strictObject({ type: z.literal('reject') }),
  z.strictObject({
    type: z.literal('set_visibility'),
    visibility: z.enum(memoryVisibilities),
  }),
]);
export type MemoryAction = z.infer<typeof memoryActionSchema>;

/** Subset of `jovie.entity-resolver/v1` FeedbackSignal emitted by owner review. */
export type MemoryFeedbackSignal =
  | 'owner_confirmed'
  | 'owner_rejected'
  | 'user_correction';

export interface MemoryFeedbackEvent {
  readonly signal: MemoryFeedbackSignal;
  readonly factKey: string;
  readonly sourceIds: readonly string[];
  readonly observedAt: string;
}

export interface MemoryActionResult {
  readonly fact: ArtistMemoryFact;
  readonly feedback: MemoryFeedbackEvent | null;
}

const ARTIST_SOURCE = 'jovie.artist';

/** Apply one owner action. Pure; the caller persists the fact and the feedback. */
export function applyMemoryAction(
  fact: ArtistMemoryFact,
  action: MemoryAction,
  now: string
): MemoryActionResult {
  const machineSources = fact.provenance
    .map(p => p.sourceId)
    .filter(id => id !== ARTIST_SOURCE);
  const feedback = (
    signal: MemoryFeedbackSignal
  ): MemoryFeedbackEvent | null =>
    machineSources.length === 0
      ? null
      : {
          signal,
          factKey: fact.key,
          sourceIds: machineSources,
          observedAt: now,
        };

  switch (action.type) {
    case 'confirm':
      return {
        fact: { ...fact, review: 'confirmed', updatedAt: now },
        feedback: feedback('owner_confirmed'),
      };
    case 'correct':
      return {
        fact: {
          ...fact,
          value: action.value,
          display: action.display,
          review: 'corrected',
          confidence: 1,
          provenance: [
            {
              sourceId: ARTIST_SOURCE,
              method: 'owner_correction',
              observedAt: now,
            },
            ...fact.provenance,
          ].slice(0, 20),
          updatedAt: now,
        },
        feedback: feedback('user_correction'),
      };
    case 'hide':
      // Hiding is a privacy choice, not a claim the fact is wrong: no feedback.
      return {
        fact: { ...fact, review: 'hidden', updatedAt: now },
        feedback: null,
      };
    case 'reject':
      return {
        fact: { ...fact, review: 'rejected', updatedAt: now },
        feedback: feedback('owner_rejected'),
      };
    case 'set_visibility':
      return {
        fact: { ...fact, visibility: action.visibility, updatedAt: now },
        feedback: null,
      };
  }
}

export type MemoryAudience = 'owner' | 'agent' | 'public';

const VISIBILITY_RANK: Record<MemoryVisibility, number> = {
  private: 0,
  agents: 1,
  public: 2,
};
const AUDIENCE_FLOOR: Record<Exclude<MemoryAudience, 'owner'>, number> = {
  agent: VISIBILITY_RANK.agents,
  public: VISIBILITY_RANK.public,
};

/**
 * Project facts for an audience. The owner sees everything (the review queue
 * included). Agents and the public only get facts that would render as true,
 * at or above their visibility floor, without private source references.
 */
export function projectArtistMemory(
  facts: readonly ArtistMemoryFact[],
  audience: MemoryAudience,
  minConfidence: number = DEFAULT_MIN_CONFIDENCE
): ArtistMemoryFact[] {
  if (audience === 'owner') return facts.map(f => ({ ...f }));
  const floor = AUDIENCE_FLOOR[audience];
  return facts
    .filter(
      f =>
        VISIBILITY_RANK[f.visibility] >= floor &&
        memoryFactDisplay(f, minConfidence) === 'show'
    )
    .map(f => ({
      ...f,
      provenance: f.provenance.map(({ sourceRef: _private, ...rest }) => rest),
    }));
}

/** The facts waiting for one-tap confirmation, most confident first. */
export function memoryReviewQueue(
  facts: readonly ArtistMemoryFact[],
  minConfidence: number = DEFAULT_MIN_CONFIDENCE
): ArtistMemoryFact[] {
  return facts
    .filter(f => memoryFactDisplay(f, minConfidence) === 'confirm_one_tap')
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}
