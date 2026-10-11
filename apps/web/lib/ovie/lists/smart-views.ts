import {
  LIST_NAME_MAX_LENGTH,
  type ListMember,
  ListModelError,
  type OvList,
} from './model';

/**
 * Smart views are saved filters over list members, with live counts. They
 * are pinned to the Ovie sidebar and auto-hide while they match nothing, so
 * the sidebar only ever shows views with work in them.
 */
export interface SmartViewFilter {
  /** Restrict to one list; omitted means across every list. */
  readonly listId?: string;
  readonly states?: readonly ListMember['state'][];
  readonly favorite?: boolean;
  readonly minRating?: number;
  /** true: only unrated members; false: only rated. */
  readonly unrated?: boolean;
}

export interface SmartView {
  readonly id: string;
  readonly name: string;
  readonly filter: SmartViewFilter;
  readonly pinned: boolean;
  /** Built-in views ship with the feature and cannot be deleted. */
  readonly builtIn: boolean;
}

export const BUILT_IN_SMART_VIEWS: readonly SmartView[] = [
  {
    id: 'suggested',
    name: 'Suggested',
    filter: { states: ['suggested'] },
    pinned: true,
    builtIn: true,
  },
  {
    id: 'favorites',
    name: 'Favorites',
    filter: { states: ['member'], favorite: true },
    pinned: true,
    builtIn: true,
  },
  {
    id: 'top-rated',
    name: '4+ stars',
    filter: { states: ['member'], minRating: 4 },
    pinned: true,
    builtIn: true,
  },
  {
    id: 'unrated',
    name: 'Unrated',
    filter: { states: ['member'], unrated: true },
    pinned: true,
    builtIn: true,
  },
];

export function normalizeSmartViewName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (!trimmed) throw new ListModelError('View name is required.');
  if (trimmed.length > LIST_NAME_MAX_LENGTH) {
    throw new ListModelError(
      `View name must be ${LIST_NAME_MAX_LENGTH} characters or fewer.`
    );
  }
  return trimmed;
}

export function memberMatchesFilter(
  member: ListMember,
  filter: SmartViewFilter
): boolean {
  if (filter.states && !filter.states.includes(member.state)) return false;
  if (filter.favorite !== undefined && member.favorite !== filter.favorite) {
    return false;
  }
  if (
    filter.minRating !== undefined &&
    (member.rating === null || member.rating < filter.minRating)
  ) {
    return false;
  }
  if (
    filter.unrated !== undefined &&
    (member.rating === null) !== filter.unrated
  ) {
    return false;
  }
  return true;
}

export interface SmartViewMatch {
  readonly listId: string;
  readonly member: ListMember;
}

export function smartViewMatches(
  view: SmartView,
  lists: readonly OvList[]
): SmartViewMatch[] {
  const matches: SmartViewMatch[] = [];
  for (const list of lists) {
    if (view.filter.listId && list.id !== view.filter.listId) continue;
    for (const member of list.members) {
      if (memberMatchesFilter(member, view.filter)) {
        matches.push({ listId: list.id, member });
      }
    }
  }
  return matches;
}

/**
 * Count distinct creators. The same creator on two lists is one row in a
 * cross-list view, so counts match what the view renders.
 */
export function smartViewCount(
  view: SmartView,
  lists: readonly OvList[]
): number {
  return new Set(smartViewMatches(view, lists).map(m => m.member.creatorId))
    .size;
}

export interface SidebarSmartView {
  readonly id: string;
  readonly name: string;
  readonly count: number;
}

/** Pinned views with at least one match, in definition order. */
export function visibleSidebarSmartViews(
  views: readonly SmartView[],
  lists: readonly OvList[]
): SidebarSmartView[] {
  const visible: SidebarSmartView[] = [];
  for (const view of views) {
    if (!view.pinned) continue;
    const count = smartViewCount(view, lists);
    if (count > 0) visible.push({ id: view.id, name: view.name, count });
  }
  return visible;
}
