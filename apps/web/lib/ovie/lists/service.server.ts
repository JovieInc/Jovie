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
import { BUILT_IN_SMART_VIEWS, visibleSidebarSmartViews } from './smart-views';
import type { ListDetail, SidebarListsPayload } from './types';

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
