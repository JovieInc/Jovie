'use client';

/**
 * Executable examples for the lib/queries contract (JOV-6190).
 *
 * README.md references this file. These fixtures are compiled and exercised
 * by examples.test.ts, so the documented patterns cannot silently drift the
 * way inline pseudo-code snippets can (e.g. the old `fetchFoo({ id })` call
 * that dropped the request signal and the resource id).
 *
 * Each fixture binds: resource/actor scope, request parameters, a response
 * decoder, a query key, a cache/retry policy, cancellation, and — for
 * mutations — the matching invalidation.
 */

import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { STANDARD_CACHE } from './cache-strategies';
import {
  createMutationFn,
  type FetchResponseSchema,
  fetchWithTimeout,
} from './fetch';

/**
 * Example domain. Real hooks put their keys in the shared `queryKeys`
 * factory in keys.ts; examples keep a local factory so this file is
 * self-contained and collision-free.
 */
export const exampleKeys = {
  all: ['example'] as const,
  item: (id: string) => [...exampleKeys.all, 'item', id] as const,
  list: (scope: string) => [...exampleKeys.all, 'list', scope] as const,
  search: (term: string) => [...exampleKeys.all, 'search', term] as const,
};

export interface ExampleItem {
  id: string;
  name: string;
}

export interface ExamplePage {
  items: ExampleItem[];
  nextCursor: string | null;
}

const exampleItemSchema: FetchResponseSchema<ExampleItem> = {
  parse(data) {
    const item = data as ExampleItem;
    if (typeof item?.id !== 'string' || typeof item?.name !== 'string') {
      throw new Error('Invalid example item payload');
    }
    return item;
  },
};

const examplePageSchema: FetchResponseSchema<ExamplePage> = {
  parse(data) {
    const page = data as ExamplePage;
    if (!Array.isArray(page?.items)) {
      throw new Error('Invalid example page payload');
    }
    return page;
  },
};

/**
 * Read: parameterized query options.
 *
 * The resource id is bound into BOTH the request URL and the query key.
 * Cancellation flows through `queryFn({ signal })` — never capture request
 * parameters by passing them as the queryFn argument.
 */
export function exampleItemQueryOptions(id: string) {
  return queryOptions({
    queryKey: exampleKeys.item(id),
    queryFn: ({ signal }) =>
      fetchWithTimeout<ExampleItem>(`/api/examples/${id}`, {
        signal,
        schema: exampleItemSchema,
      }),
    ...STANDARD_CACHE,
    retry: 1,
    enabled: id.length > 0,
  });
}

export function useExampleItemQuery(id: string) {
  return useQuery(exampleItemQueryOptions(id));
}

/**
 * Paginated read: native infiniteQueryOptions with a cursor bound to the
 * actor/resource scope in the key.
 */
export function exampleListInfiniteQueryOptions(scope: string) {
  return infiniteQueryOptions({
    queryKey: exampleKeys.list(scope),
    queryFn: ({ signal, pageParam }) =>
      fetchWithTimeout<ExamplePage>(
        `/api/examples?scope=${encodeURIComponent(scope)}&cursor=${encodeURIComponent(pageParam)}`,
        { signal, schema: examplePageSchema }
      ),
    initialPageParam: '',
    getNextPageParam: (lastPage: ExamplePage) => lastPage.nextCursor,
    ...STANDARD_CACHE,
  });
}

/**
 * Search + pacing: only fire once the term is meaningful, and keep results
 * fresh briefly so rapid typing does not stampede the endpoint.
 */
export function useExampleSearchQuery(term: string) {
  const normalized = term.trim();
  return useQuery(
    queryOptions({
      queryKey: exampleKeys.search(normalized),
      queryFn: ({ signal }) =>
        fetchWithTimeout<ExamplePage>(
          `/api/examples/search?q=${encodeURIComponent(normalized)}`,
          { signal, schema: examplePageSchema }
        ),
      enabled: normalized.length >= 2,
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      placeholderData: previous => previous,
    })
  );
}

const updateExampleItem = createMutationFn<
  { id: string; name: string },
  ExampleItem
>('/api/examples', 'PATCH', { schema: exampleItemSchema });

/**
 * Mutation: invalidate the client caches that can hold the mutated entity.
 * If the data also lives in the Next.js data cache (public profile pages,
 * ISR), the server action/route handler must additionally call the matching
 * helper in lib/cache/ (e.g. invalidateProfileCache) — client invalidation
 * alone does not purge the server cache.
 */
export function useUpdateExampleItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateExampleItem,
    onSuccess: (item, { id }) => {
      queryClient.setQueryData(exampleKeys.item(id), item);
      void queryClient.invalidateQueries({ queryKey: exampleKeys.all });
    },
  });
}

/**
 * Autosave: same mutation contract, but scoped invalidation only — autosave
 * writes must not blow away sibling list caches or show toasts on every
 * keystroke.
 */
export function useExampleAutosaveMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateExampleItem,
    onSuccess: item => {
      queryClient.setQueryData(exampleKeys.item(id), item);
    },
  });
}
