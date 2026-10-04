/**
 * Ovie lists: founder-dogfood manual lists ("Collab list", "Press") plus
 * smart views (saved filters with counts). Pure model, no IO. Persistence
 * lives in list-store.server.ts on the existing Ovie operating KV.
 *
 * Every rating, favorite, swipe and suggestion decision is appended to the
 * list's label log. That log is the training data for the auto-fill learner
 * (learner.ts); membership state is derived from the same events, so the two
 * cannot drift.
 */

export const LIST_NAME_MAX_LENGTH = 60;
export const MAX_RATING = 5;

export type ListMemberState = 'member' | 'suggested' | 'passed';

export interface ListMember {
  readonly creatorId: string;
  readonly state: ListMemberState;
  /** 1-5 stars; null when unrated. */
  readonly rating: number | null;
  readonly favorite: boolean;
  readonly source: 'manual' | 'suggestion';
  readonly addedAt: string;
  /** Explainable reasons captured when Jovie suggested this creator. */
  readonly suggestionReasons?: readonly string[];
}

export type ListLabelSignal =
  | 'add'
  | 'remove'
  | 'swipe_right'
  | 'swipe_left'
  | 'rate'
  | 'favorite'
  | 'unfavorite'
  | 'suggest'
  | 'accept_suggestion'
  | 'reject_suggestion';

export interface ListLabelEvent {
  readonly creatorId: string;
  readonly signal: ListLabelSignal;
  /** Star rating for `rate`; unused otherwise. */
  readonly value?: number;
  readonly at: string;
}

export interface OvList {
  readonly id: string;
  readonly name: string;
  readonly pinned: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly members: readonly ListMember[];
  readonly labels: readonly ListLabelEvent[];
}

export type ListAction =
  | { readonly type: 'add'; readonly creatorId: string }
  | { readonly type: 'remove'; readonly creatorId: string }
  | {
      readonly type: 'swipe';
      readonly creatorId: string;
      readonly direction: 'left' | 'right';
    }
  | {
      readonly type: 'rate';
      readonly creatorId: string;
      readonly rating: number | null;
    }
  | {
      readonly type: 'favorite';
      readonly creatorId: string;
      readonly favorite: boolean;
    }
  | {
      readonly type: 'suggest';
      readonly suggestions: readonly {
        readonly creatorId: string;
        readonly reasons: readonly string[];
      }[];
    }
  | { readonly type: 'accept_suggestion'; readonly creatorId: string }
  | { readonly type: 'reject_suggestion'; readonly creatorId: string }
  | { readonly type: 'rename'; readonly name: string }
  | { readonly type: 'pin'; readonly pinned: boolean };

export class ListModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ListModelError';
  }
}

export function normalizeListName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (!trimmed) throw new ListModelError('List name is required.');
  if (trimmed.length > LIST_NAME_MAX_LENGTH) {
    throw new ListModelError(
      `List name must be ${LIST_NAME_MAX_LENGTH} characters or fewer.`
    );
  }
  return trimmed;
}

export function createList(input: {
  readonly id: string;
  readonly name: string;
  readonly now: string;
}): OvList {
  return {
    id: input.id,
    name: normalizeListName(input.name),
    pinned: true,
    createdAt: input.now,
    updatedAt: input.now,
    members: [],
    labels: [],
  };
}

function assertRating(rating: number | null): void {
  if (rating === null) return;
  if (!Number.isInteger(rating) || rating < 1 || rating > MAX_RATING) {
    throw new ListModelError(`Rating must be 1-${MAX_RATING} or cleared.`);
  }
}

function upsertMember(
  members: readonly ListMember[],
  creatorId: string,
  update: (existing: ListMember | undefined) => ListMember | null
): ListMember[] {
  const index = members.findIndex(m => m.creatorId === creatorId);
  const next = update(index === -1 ? undefined : members[index]);
  const copy = [...members];
  if (index === -1) {
    if (next) copy.push(next);
  } else if (next) {
    copy[index] = next;
  } else {
    copy.splice(index, 1);
  }
  return copy;
}

function newMember(
  creatorId: string,
  now: string,
  overrides: Partial<ListMember>
): ListMember {
  return {
    creatorId,
    state: 'member',
    rating: null,
    favorite: false,
    source: 'manual',
    addedAt: now,
    ...overrides,
  };
}

/**
 * Apply one user action. Returns a new list; the input is never mutated.
 * Each action appends exactly the label events the learner should see.
 */
export function applyListAction(
  list: OvList,
  action: ListAction,
  now: string
): OvList {
  const labels: ListLabelEvent[] = [];
  let members: readonly ListMember[] = list.members;
  let name = list.name;
  let pinned = list.pinned;

  switch (action.type) {
    case 'rename':
      name = normalizeListName(action.name);
      break;
    case 'pin':
      pinned = action.pinned;
      break;
    case 'add':
      members = upsertMember(members, action.creatorId, existing =>
        existing
          ? { ...existing, state: 'member' }
          : newMember(action.creatorId, now, {})
      );
      labels.push({ creatorId: action.creatorId, signal: 'add', at: now });
      break;
    case 'remove':
      members = upsertMember(members, action.creatorId, () => null);
      labels.push({ creatorId: action.creatorId, signal: 'remove', at: now });
      break;
    case 'swipe': {
      // Swiping a pending suggestion is the accept/reject decision itself, so
      // precision counts triage-mode decisions too.
      const current = members.find(m => m.creatorId === action.creatorId);
      if (current?.state === 'suggested') {
        return applyListAction(
          list,
          {
            type:
              action.direction === 'right'
                ? 'accept_suggestion'
                : 'reject_suggestion',
            creatorId: action.creatorId,
          },
          now
        );
      }
      const state: ListMemberState =
        action.direction === 'right' ? 'member' : 'passed';
      members = upsertMember(members, action.creatorId, existing =>
        existing
          ? { ...existing, state }
          : newMember(action.creatorId, now, { state })
      );
      labels.push({
        creatorId: action.creatorId,
        signal: action.direction === 'right' ? 'swipe_right' : 'swipe_left',
        at: now,
      });
      break;
    }
    case 'rate':
      assertRating(action.rating);
      members = upsertMember(members, action.creatorId, existing =>
        existing
          ? { ...existing, rating: action.rating }
          : newMember(action.creatorId, now, { rating: action.rating })
      );
      labels.push({
        creatorId: action.creatorId,
        signal: 'rate',
        ...(action.rating == null ? {} : { value: action.rating }),
        at: now,
      });
      break;
    case 'favorite':
      members = upsertMember(members, action.creatorId, existing =>
        existing
          ? { ...existing, favorite: action.favorite }
          : newMember(action.creatorId, now, { favorite: action.favorite })
      );
      labels.push({
        creatorId: action.creatorId,
        signal: action.favorite ? 'favorite' : 'unfavorite',
        at: now,
      });
      break;
    case 'suggest':
      for (const suggestion of action.suggestions) {
        // Never resurface someone already decided on: members stay members,
        // passed stays passed. Suggestions are proposals, never auto-adds.
        if (members.some(m => m.creatorId === suggestion.creatorId)) continue;
        members = upsertMember(members, suggestion.creatorId, () =>
          newMember(suggestion.creatorId, now, {
            state: 'suggested',
            source: 'suggestion',
            suggestionReasons: suggestion.reasons,
          })
        );
        labels.push({
          creatorId: suggestion.creatorId,
          signal: 'suggest',
          at: now,
        });
      }
      break;
    case 'accept_suggestion':
    case 'reject_suggestion': {
      const existing = members.find(m => m.creatorId === action.creatorId);
      if (existing?.state !== 'suggested') {
        throw new ListModelError('That creator is not a pending suggestion.');
      }
      const accepted = action.type === 'accept_suggestion';
      members = upsertMember(members, action.creatorId, current =>
        current ? { ...current, state: accepted ? 'member' : 'passed' } : null
      );
      labels.push({
        creatorId: action.creatorId,
        signal: accepted ? 'accept_suggestion' : 'reject_suggestion',
        at: now,
      });
      break;
    }
  }

  return {
    ...list,
    name,
    pinned,
    members,
    labels: [...list.labels, ...labels],
    updatedAt: now,
  };
}

export function listMemberCount(list: OvList): number {
  return list.members.filter(m => m.state === 'member').length;
}

export function pendingSuggestions(list: OvList): ListMember[] {
  return list.members.filter(m => m.state === 'suggested');
}

/** A labelled preference example for the learner. */
export interface PreferenceExample {
  readonly creatorId: string;
  /** +1 wants on the list, -1 does not. */
  readonly label: 1 | -1;
  /** Strength: favorites and 5 stars count more than a bare swipe. */
  readonly weight: number;
}

/**
 * Collapse the current list state into one example per decided creator.
 * Current state wins over history: a creator swiped left then later added is
 * a positive example. Pending suggestions are unlabelled and excluded.
 */
export function preferenceExamples(list: OvList): PreferenceExample[] {
  const examples: PreferenceExample[] = [];
  for (const member of list.members) {
    if (member.state === 'suggested') continue;
    if (member.state === 'passed') {
      examples.push({ creatorId: member.creatorId, label: -1, weight: 1 });
      continue;
    }
    if (member.rating !== null && member.rating <= 2) {
      // Kept on the list but rated low: a weak negative for taste.
      examples.push({ creatorId: member.creatorId, label: -1, weight: 0.5 });
      continue;
    }
    let weight = 1;
    if (member.rating !== null && member.rating >= 4) weight += 0.5;
    if (member.rating === MAX_RATING) weight += 0.5;
    if (member.favorite) weight += 1;
    examples.push({ creatorId: member.creatorId, label: 1, weight });
  }
  return examples;
}

/**
 * Suggestion precision measured against later accepts: of the suggestions
 * the founder decided on, how many were accepted. Undecided suggestions do
 * not count either way.
 */
export function suggestionPrecision(list: OvList): {
  readonly accepted: number;
  readonly rejected: number;
  readonly pending: number;
  readonly precision: number | null;
} {
  let accepted = 0;
  let rejected = 0;
  for (const event of list.labels) {
    if (event.signal === 'accept_suggestion') accepted += 1;
    if (event.signal === 'reject_suggestion') rejected += 1;
  }
  const decided = accepted + rejected;
  return {
    accepted,
    rejected,
    pending: pendingSuggestions(list).length,
    precision: decided === 0 ? null : accepted / decided,
  };
}
