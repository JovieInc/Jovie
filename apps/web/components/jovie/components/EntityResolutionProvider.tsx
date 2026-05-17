'use client';

import { QueryClientContext } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
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
const EMPTY_ENTITY_CACHE_SNAPSHOT = '0:0:0:0';

interface EntityResolutionProviderProps {
  readonly profileId: string | null | undefined;
  readonly children: ReactNode;
}

function areQueryKeysEqual(
  left: readonly unknown[],
  right: readonly unknown[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]))
  );
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
  const releaseMatrixKey = useMemo(
    () => (profileId ? queryKeys.releases.matrix(profileId) : null),
    [profileId]
  );
  const eventsListKey = useMemo(
    () => (profileId ? queryKeys.events.list(profileId) : null),
    [profileId]
  );

  const getEntityCacheSnapshot = useCallback(() => {
    if (!queryClient || !releaseMatrixKey || !eventsListKey) {
      return EMPTY_ENTITY_CACHE_SNAPSHOT;
    }

    const releaseState = queryClient.getQueryState(releaseMatrixKey);
    const eventState = queryClient.getQueryState(eventsListKey);
    return [
      releaseState?.dataUpdateCount ?? 0,
      releaseState?.dataUpdatedAt ?? 0,
      eventState?.dataUpdateCount ?? 0,
      eventState?.dataUpdatedAt ?? 0,
    ].join(':');
  }, [eventsListKey, queryClient, releaseMatrixKey]);

  const subscribeToEntityCache = useCallback(
    (notify: () => void) => {
      if (!queryClient || !releaseMatrixKey || !eventsListKey) {
        return () => {};
      }

      let isSubscribed = true;
      let notifyQueued = false;
      const queueNotify = () => {
        if (notifyQueued) return;
        notifyQueued = true;
        queueMicrotask(() => {
          notifyQueued = false;
          if (!isSubscribed) return;
          notify();
        });
      };

      const cache = queryClient.getQueryCache();
      const unsubscribe = cache.subscribe(event => {
        const key = event.query.queryKey;
        if (!Array.isArray(key)) return;
        if (
          areQueryKeysEqual(key, releaseMatrixKey) ||
          areQueryKeysEqual(key, eventsListKey)
        ) {
          queueNotify();
        }
      });
      return () => {
        isSubscribed = false;
        unsubscribe();
      };
    },
    [eventsListKey, queryClient, releaseMatrixKey]
  );

  const cacheSnapshot = useSyncExternalStore(
    subscribeToEntityCache,
    getEntityCacheSnapshot,
    () => EMPTY_ENTITY_CACHE_SNAPSHOT
  );

  const resolver = useMemo<ResolverFn>(() => {
    // cacheSnapshot is intentionally part of the closure so memoization
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
    // cacheSnapshot participates so consumers re-derive on cache change.
    // queryClient is stable from React Query's provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, queryClient, cacheSnapshot]);

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
