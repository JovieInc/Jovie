import 'server-only';
import { getCandidatePool, getListCreatorsByIds } from './creators.server';
import { rankListCandidates } from './learner';
import {
  type ListUpdateResult,
  readAllLists,
  readList,
  updateList,
} from './list-store.server';
import {
  listMemberCount,
  pendingSuggestions,
  preferenceExamples,
  suggestionPrecision,
} from './model';
import {
  BUILT_IN_SMART_VIEWS,
  smartViewMatches,
  visibleSidebarSmartViews,
} from './smart-views';
import type { ListDetail, SidebarListsPayload, SmartViewDetail } from './types';

export const SUGGESTION_BATCH_SIZE = 10;

export async function getSidebarLists(): Promise<SidebarListsPayload> {
  const lists = await readAllLists();
  return {
    lists: lists
      .filter(list => list.pinned)
      .map(list => ({
        id: list.id,
        name: list.name,
        count: listMemberCount(list),
        pendingSuggestions: pendingSuggestions(list).length,
      })),
    smartViews: visibleSidebarSmartViews(BUILT_IN_SMART_VIEWS, lists),
  };
}

export async function getListDetail(id: string): Promise<ListDetail | null> {
  const list = await readList(id);
  if (!list) return null;
  const creators = await getListCreatorsByIds(
    list.members.map(m => m.creatorId)
  );
  return { list, creators, precision: suggestionPrecision(list) };
}

/**
 * Train on this list's labels and propose the next batch. Suggestions land
 * as `suggested` members with their reasons; nothing becomes a member until
 * the founder accepts it.
 */
export async function suggestForList(id: string): Promise<ListUpdateResult> {
  const list = await readList(id);
  if (!list) return { outcome: 'not_found' };
  const examples = preferenceExamples(list);
  const [labelled, pool] = await Promise.all([
    getListCreatorsByIds(examples.map(e => e.creatorId)),
    getCandidatePool(),
  ]);
  const ranked = rankListCandidates({
    examples,
    creatorsById: new Map(labelled.map(c => [c.id, c])),
    candidates: pool,
    excludeIds: new Set(list.members.map(m => m.creatorId)),
    limit: SUGGESTION_BATCH_SIZE,
  });
  if (ranked.length === 0) return { outcome: 'updated', list };
  return updateList(id, [
    {
      type: 'suggest',
      suggestions: ranked.map(r => ({
        creatorId: r.creatorId,
        reasons: r.reasons.map(reason => reason.text),
      })),
    },
  ]);
}

/** Rows for one smart view across every list, with the creators to render. */
export async function getSmartViewDetail(
  viewId: string
): Promise<SmartViewDetail | null> {
  const view = BUILT_IN_SMART_VIEWS.find(v => v.id === viewId);
  if (!view) return null;
  const lists = await readAllLists();
  const names = new Map(lists.map(list => [list.id, list.name]));
  const rows = smartViewMatches(view, lists).map(match => ({
    listId: match.listId,
    listName: names.get(match.listId) ?? '',
    member: match.member,
  }));
  const creators = await getListCreatorsByIds([
    ...new Set(rows.map(row => row.member.creatorId)),
  ]);
  return { view: { id: view.id, name: view.name }, rows, creators };
}
