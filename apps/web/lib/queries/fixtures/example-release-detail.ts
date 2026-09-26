'use client';

/**
 * Compiled fixture for the read/mutation contract documented in
 * apps/web/lib/queries/README.md.
 *
 * The README references this file instead of inline snippets so the
 * documented pattern stays type-checked and is exercised by
 * example-release-detail.test.ts. Copy the shape, not the text.
 *
 * Each binding the contract requires:
 * - resource + actor scope: `queryKeys.releases.detail(profileId, releaseId)`
 * - request parameters: ids encoded into the request URL by the caller,
 *   not passed to `createQueryFn`'s result (which only accepts `{ signal }`)
 * - response decoder: `schema` validates the payload before it reaches cache
 * - key: `queryKeys` factory, never a hand-rolled array
 * - cache/retry policy: named preset plus explicit retry ownership
 * - cancellation: TanStack's `signal` forwarded through `createQueryFn`
 * - invalidation: mutation `onSuccess` invalidates detail + list scopes
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { STANDARD_CACHE } from '../cache-strategies';
import { createMutationFn, createQueryFn, FetchError } from '../fetch';
import { queryKeys } from '../keys';

const exampleReleaseSchema = z.object({
  id: z.string().min(1),
  profileId: z.string().min(1),
  title: z.string(),
});

export type ExampleReleaseDetail = z.infer<typeof exampleReleaseSchema>;

/**
 * `createQueryFn` binds a fixed URL plus transport options and returns a
 * `({ signal }) => Promise<T>` queryFn. Resource ids belong in the URL,
 * so build the fetcher per (profileId, releaseId) — never call the
 * returned function with `{ id }`.
 */
const fetchReleaseDetail = (profileId: string, releaseId: string) =>
  createQueryFn<ExampleReleaseDetail>(
    `/api/releases/${encodeURIComponent(releaseId)}?profileId=${encodeURIComponent(profileId)}`,
    { schema: exampleReleaseSchema }
  );

export function useExampleReleaseDetailQuery(
  profileId: string,
  releaseId: string
) {
  return useQuery({
    queryKey: queryKeys.releases.detail(profileId, releaseId),
    queryFn: ({ signal }) =>
      fetchReleaseDetail(
        profileId,
        releaseId
      )({
        signal,
      }),
    enabled: Boolean(profileId && releaseId),
    ...STANDARD_CACHE,
    // One retry owner: this hook. Do not also retry inside the fetcher.
    retry: (failureCount: number, error: Error) => {
      if (error instanceof FetchError && !error.isRetryable()) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

interface RenameReleaseInput {
  title: string;
}

export function useExampleReleaseRenameMutation(
  profileId: string,
  releaseId: string
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RenameReleaseInput) =>
      createMutationFn<RenameReleaseInput, ExampleReleaseDetail>(
        `/api/releases/${encodeURIComponent(releaseId)}`,
        'PATCH',
        { schema: exampleReleaseSchema }
      )(input),
    onSuccess: () => {
      // Detail + list scopes both read this entity; invalidate each key the
      // write can affect. Server-cache (unstable_cache/ISR) invalidation for
      // public profile surfaces lives in lib/cache/ on the server side.
      queryClient.invalidateQueries({
        queryKey: queryKeys.releases.detail(profileId, releaseId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.releases.matrix(profileId),
      });
    },
  });
}
