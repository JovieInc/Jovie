'use client';

import { QueryClientContext } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { EntityKind } from '@/lib/chat/tokens';
import type { EntityRef } from '@/lib/commands/entities';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys } from '@/lib/queries';
import type { EventRecord } from '@/lib/queries/useEventsQuery';
import { releaseRowToEntityRef } from './entity-mappers';
import { eventToEntityRef } from './event-provider';

interface EntityResolution {
  readonly ref: EntityRef | undefined;
  readonly isLoading: boolean;
}

interface ResolverFn {
  (kind: EntityKind, id: string): EntityResolution;
}

const NULL_RESOLUTION: EntityResolution = {
  ref: undefined,
  isLoading: false,
};

const NULL_RESOLVER: ResolverFn = () => NULL_RESOLUTION;

const EntityResolutionContext = createContext<ResolverFn>(NULL_RESOLVER);

interface EntityResolutionProviderProps {
  readonly profileId: string | null | undefined;
  readonly children: ReactNode;
}

/**
 * Cache-only entity resolver for chat transcript chips.
 *
 * Reads `queryClient.getQueryData` for each kind's matrix key. Never calls a
 * query hook — those would trigger a fetch when the slash menu hasn't loaded
 * data yet, which would make every chat session pull the release matrix even
 * for users who never `@`-mention anything.
 *
 * Subscribes to the QueryCache so transcript chips re-render when the cache
 * fills (e.g. user opens the slash menu, releases load, existing chips light
 * up with artwork).
 *
 * Outside a provider mount (e.g. `OnboardingChat`), `useEntityResolution`
 * returns `{ ref: undefined, isLoading: false }` so chips degrade gracefully
 * to label + accent dot.
 */
export function EntityResolutionProvider({
  profileId,
  children,
}: EntityResolutionProviderProps) {
  // Read the QueryClient via its context directly so we degrade cleanly when
  // no QueryClientProvider is mounted above us (e.g. lightweight unit tests
  // of JovieChat, or hypothetical SSR-only consumers). `useQueryClient()`
  // throws on missing provider; we'd rather no-op.
  const queryClient = useContext(QueryClientContext);
  // Bump on every QueryCache update — the resolver function reads from
  // getQueryData, so its closed-over cache snapshot is implicit. The version
  // counter forces a context re-publish when the underlying data changes.
  const [cacheVersion, setCacheVersion] = useState(0);

  useEffect(() => {
    if (!queryClient) return;
    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe(event => {
      // Only re-publish when releases or events data actually changes.
      // Filters out unrelated cache churn (billing, audience, etc.).
      const key = event.query.queryKey;
      if (!Array.isArray(key)) return;
      const root = key[0];
      if (root === 'releases' || root === 'events') {
        setCacheVersion(v => v + 1);
      }
    });
    return unsubscribe;
  }, [queryClient]);

  const resolver = useMemo<ResolverFn>(() => {
    // cacheVersion is intentionally part of the closure so memoization
    // re-fires when caches change. Reads are deferred until each chip calls.
    if (!profileId || !queryClient) {
      return () => NULL_RESOLUTION;
    }
    return (kind, id) => {
      if (kind === 'release') {
        const releases = queryClient.getQueryData<ReleaseViewModel[]>(
          queryKeys.releases.matrix(profileId)
        );
        if (!releases) return NULL_RESOLUTION;
        const row = releases.find(r => r.id === id);
        if (!row) return NULL_RESOLUTION;
        return { ref: releaseRowToEntityRef(row), isLoading: false };
      }
      if (kind === 'event') {
        const events = queryClient.getQueryData<EventRecord[]>(
          queryKeys.events.list(profileId)
        );
        if (!events) return NULL_RESOLUTION;
        const row = events.find(e => e.id === id);
        if (!row) return NULL_RESOLUTION;
        return { ref: eventToEntityRef(row), isLoading: false };
      }
      // artist (search-result-scoped, no profile matrix) and track (no query
      // hook yet) — degrade gracefully. EntityChip falls back to accent dot
      // + label, which is identical to today's empty-thumbnail behavior.
      return NULL_RESOLUTION;
    };
    // cacheVersion participates so consumers re-derive on cache change.
    // queryClient is stable from React Query's provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, queryClient, cacheVersion]);

  return (
    <EntityResolutionContext.Provider value={resolver}>
      {children}
    </EntityResolutionContext.Provider>
  );
}

/**
 * Resolve a chat token to a richer `EntityRef` using whatever is already in
 * TanStack Query cache. Never triggers fetches. Returns `undefined` ref when
 * the entity isn't cached or no provider is mounted.
 */
export function useEntityResolution(
  kind: EntityKind,
  id: string
): EntityResolution {
  const resolver = useContext(EntityResolutionContext);
  return useMemo(() => resolver(kind, id), [resolver, kind, id]);
}

/**
 * Lower-level hook for callers that need to imperatively resolve an entity
 * outside of render (e.g. inside an event handler). Returns the same
 * resolver function the provider publishes.
 */
export function useEntityResolver(): ResolverFn {
  return useContext(EntityResolutionContext);
}

// Exported for tests that want to assert "no provider mounted" behavior.
export const NULL_ENTITY_RESOLUTION = NULL_RESOLUTION;
