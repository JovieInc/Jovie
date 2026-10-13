'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListAction, OvList } from '@/lib/ovie/lists/model';
import type {
  ListCreator,
  ListDetail,
  SidebarListsPayload,
  SmartViewDetail,
} from '@/lib/ovie/lists/types';
import { FREQUENT_CACHE, SEARCH_CACHE } from './cache-strategies';
import { FetchError, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export const OVIE_LISTS_ENDPOINT = '/api/admin/ov-lists';

/** Client-sendable actions; suggestions only come from the server learner. */
export type ClientListAction = Exclude<ListAction, { type: 'suggest' }>;

/** Sidebar lists + non-empty pinned smart views (Ovie shell only). */
export function useOvieSidebarListsQuery() {
  return useQuery({
    queryKey: queryKeys.admin.lists.sidebar(),
    queryFn: ({ signal }) =>
      fetchWithTimeout<SidebarListsPayload>(OVIE_LISTS_ENDPOINT, { signal }),
    ...FREQUENT_CACHE,
    retry: 1,
  });
}

export function useOvieListDetailQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.admin.lists.detail(id),
    queryFn: ({ signal }) =>
      fetchWithTimeout<ListDetail>(`${OVIE_LISTS_ENDPOINT}/${id}`, {
        signal,
        timeout: 15_000,
      }),
    ...FREQUENT_CACHE,
    retry: 1,
  });
}

export function useOvieSmartViewQuery(viewId: string) {
  return useQuery({
    queryKey: queryKeys.admin.lists.view(viewId),
    queryFn: ({ signal }) =>
      fetchWithTimeout<SmartViewDetail>(
        `${OVIE_LISTS_ENDPOINT}/views/${viewId}`,
        { signal, timeout: 15_000 }
      ),
    ...FREQUENT_CACHE,
    retry: 1,
  });
}

export function useOvieListCreatorSearchQuery(query: string) {
  const term = query.trim();
  return useQuery({
    queryKey: queryKeys.admin.lists.creatorSearch(term),
    queryFn: ({ signal }) =>
      fetchWithTimeout<{ creators: ListCreator[] }>(
        `${OVIE_LISTS_ENDPOINT}/creators?q=${encodeURIComponent(term)}`,
        { signal }
      ),
    enabled: term.length >= 2,
    ...SEARCH_CACHE,
  });
}

export function getListErrorMessage(error: unknown): string {
  if (error instanceof FetchError) {
    const message = error.parsedBody?.error;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'That change did not save. Try again.';
}

export function useCreateOvieListMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      fetchWithTimeout<{ list: OvList }>(OVIE_LISTS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.lists.sidebar(),
      }),
  });
}

/**
 * Apply list actions. The server returns the whole list; swap it into the
 * detail cache in place so row order, focus and scroll stay put. Takes the
 * list id per call so cross-list smart views can edit any row.
 */
export function useOvieListActionsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      readonly listId: string;
      readonly actions: readonly ClientListAction[];
    }) =>
      fetchWithTimeout<{ list: OvList }>(
        `${OVIE_LISTS_ENDPOINT}/${input.listId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actions: input.actions }),
        }
      ),
    onSuccess: ({ list }) => {
      queryClient.setQueryData<ListDetail>(
        queryKeys.admin.lists.detail(list.id),
        current => (current ? { ...current, list } : current)
      );
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.lists.all() }),
  });
}

export function useSuggestOvieListMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchWithTimeout<{ list: OvList }>(
        `${OVIE_LISTS_ENDPOINT}/${id}/suggest`,
        { method: 'POST', timeout: 20_000 }
      ),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.lists.all() }),
  });
}
