/**
 * Rule-based classifier mapping Opportunity Inbox signals to typed categories
 * (JOV #11507): new song / new event / new profile match / other.
 *
 * Classification is a pure function of the suggested-action row so it can run
 * at read time for legacy rows; detectors may persist an explicit
 * `signal_type` which always wins over the heuristics.
 */

export const OPPORTUNITY_SIGNAL_TYPES = [
  'new_song',
  'new_event',
  'new_profile_match',
  'other',
] as const;

export type OpportunitySignalType = (typeof OPPORTUNITY_SIGNAL_TYPES)[number];

export interface OpportunitySignalTypeInput {
  readonly kind: string;
  readonly payload: unknown;
  readonly rationale: string | null;
  /** Persisted classification from the detector; wins over heuristics. */
  readonly signalType?: string | null;
}

export function isOpportunitySignalType(
  value: unknown
): value is OpportunitySignalType {
  return (
    typeof value === 'string' &&
    (OPPORTUNITY_SIGNAL_TYPES as readonly string[]).includes(value)
  );
}

/** Kind prefixes emitted by detectors, checked before free-text heuristics. */
const KIND_PREFIX_RULES: readonly (readonly [
  OpportunitySignalType,
  readonly string[],
])[] = [
  ['new_song', ['release.', 'song.', 'track.', 'music.']],
  ['new_event', ['calendar.', 'event.', 'tour.', 'booking.', 'show.']],
  ['new_profile_match', ['profile.', 'profile_match.', 'match.', 'collab.']],
];

const PROFILE_MATCH_PATTERN =
  /\b(profile[\s-]match(es)?|matched profile|matching profile|collab(oration)?s?|similar artists?|artist match(es)?)\b/i;

const SONG_PATTERN =
  /\b(new (song|track|single|album|ep|release|music)|(song|track|single|album|ep|release) (detected|dropped|out now|is live)|dropped a (song|track|single|album|ep))\b/i;

const EVENT_PATTERN =
  /\b(shows?|concerts?|tours?|tour dates?|gigs?|venues?|festivals?|bookings?|events?|listening part(y|ies))\b/i;

function payloadText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const record = payload as Record<string, unknown>;
  return ['title', 'rationale', 'description', 'summary']
    .map(key => record[key])
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
}

/**
 * Classify a suggested-action row into a typed inbox category.
 *
 * Precedence: persisted `signalType` → detector kind prefix → keyword
 * heuristics over title/rationale text (profile match → song → event) →
 * `other`.
 */
export function classifyOpportunitySignalType(
  input: OpportunitySignalTypeInput
): OpportunitySignalType {
  if (isOpportunitySignalType(input.signalType)) {
    return input.signalType;
  }

  const kind = input.kind.toLowerCase();
  for (const [type, prefixes] of KIND_PREFIX_RULES) {
    if (prefixes.some(prefix => kind.startsWith(prefix))) {
      return type;
    }
  }

  const text = `${payloadText(input.payload)} ${input.rationale ?? ''}`;
  if (PROFILE_MATCH_PATTERN.test(text)) {
    return 'new_profile_match';
  }
  if (SONG_PATTERN.test(text)) {
    return 'new_song';
  }
  if (EVENT_PATTERN.test(text)) {
    return 'new_event';
  }

  return 'other';
}

export interface OpportunitySignalTypeMeta {
  /** Title Case label rendered in the card meta row. */
  readonly label: string;
  /** Plural filter-chip label. */
  readonly filterLabel: string;
}

export const OPPORTUNITY_SIGNAL_TYPE_META: Readonly<
  Record<OpportunitySignalType, OpportunitySignalTypeMeta>
> = {
  new_song: { label: 'New Song', filterLabel: 'Songs' },
  new_event: { label: 'New Event', filterLabel: 'Events' },
  new_profile_match: {
    label: 'Profile Match',
    filterLabel: 'Profile Matches',
  },
  other: { label: 'Suggestion', filterLabel: 'Other' },
};
