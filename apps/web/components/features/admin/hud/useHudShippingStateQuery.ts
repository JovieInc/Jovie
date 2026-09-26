'use client';

// @coverage-via apps/web/tests/unit/components/features/admin/hud/OvieShippingStateCard.test.tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import { parseShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import {
  applyShippingStateRead,
  createEmptyShippingStateView,
  createShippingMachine,
  expireShippingStateIfNeeded,
  SHIPPING_STATE_CACHE_GC_MS,
  SHIPPING_STATE_POLL_INTERVAL_MS,
  type ShippingMachineState,
  type ShippingStateView,
  shippingStateReadFromHttp,
} from '@/lib/ovie/shipping-state-client';
import { REALTIME_CACHE } from '@/lib/queries/cache-strategies';

type OperationalTaskFeed = ShippingCockpitProjection['operationalTasks'];
type OperationalRequestState = 'idle' | 'error';

export type HudShippingSnapshot = {
  readonly view: ShippingStateView;
  readonly operationalTasks: OperationalTaskFeed;
  readonly operationalRequestState: OperationalRequestState;
};

const EMPTY_OPERATIONAL_FEED: OperationalTaskFeed = {
  canonicalSource: 'linear',
  cacheMode: 'local-reconciled',
  syncState: 'syncing',
  sourceId: 'symphony-runtime',
  observedAt: null,
  lastSyncedAt: null,
  freshnessDeadline: null,
  tasks: [],
  deltas: [],
};

const shippingMachines = new Map<string, ShippingMachineState>();
const lastOperationalTasks = new Map<string, OperationalTaskFeed>();
const shippingObservers = new Map<string, number>();
const subscribedCaches = new WeakSet<object>();

function tokenKey(kioskToken: string | null): string {
  return kioskToken ?? '';
}

function forgetHudShippingState(key: string): void {
  shippingMachines.delete(key);
  lastOperationalTasks.delete(key);
}

function retainHudShippingStateUntilQueryRemoval(cache: {
  subscribe: (
    listener: (event: {
      type: string;
      query: { queryKey: readonly unknown[] };
    }) => void
  ) => () => void;
}): void {
  if (subscribedCaches.has(cache)) return;
  subscribedCaches.add(cache);
  cache.subscribe(event => {
    if (event.type !== 'removed') return;
    const { queryKey } = event.query;
    if (queryKey[0] !== 'hud' || queryKey[1] !== 'shipping-state') return;
    const token = queryKey[2];
    forgetHudShippingState(tokenKey(typeof token === 'string' ? token : null));
  });
}

/** Test-only: the shipping machine is shared by every HUD observer. */
export function resetHudShippingStateForTests(): void {
  shippingMachines.clear();
  lastOperationalTasks.clear();
  shippingObservers.clear();
}

/** Test-only: module maps must not outlive the query that filled them. */
export function hudShippingStateRetentionForTests(): {
  machines: number;
  operationalFeeds: number;
} {
  return {
    machines: shippingMachines.size,
    operationalFeeds: lastOperationalTasks.size,
  };
}

function snapshotFor(
  key: string,
  view: ShippingStateView,
  operationalRequestState: OperationalRequestState,
  operationalTasks?: OperationalTaskFeed
): HudShippingSnapshot {
  if (operationalTasks) lastOperationalTasks.set(key, operationalTasks);
  return {
    view,
    operationalTasks: lastOperationalTasks.get(key) ?? EMPTY_OPERATIONAL_FEED,
    operationalRequestState,
  };
}

/**
 * One poll of `/api/hud/shipping-state` for the delivery card and the
 * operational task list. The machine is keyed by kiosk token so two
 * observers share a query function without diverging refs.
 */
export function useHudShippingStateQuery(kioskToken: string | null) {
  const queryClient = useQueryClient();
  retainHudShippingStateUntilQueryRemoval(queryClient.getQueryCache());

  useEffect(() => {
    const key = tokenKey(kioskToken);
    shippingObservers.set(key, (shippingObservers.get(key) ?? 0) + 1);
    return () => {
      const remaining = (shippingObservers.get(key) ?? 1) - 1;
      if (remaining > 0) {
        shippingObservers.set(key, remaining);
        return;
      }
      shippingObservers.delete(key);
      forgetHudShippingState(key);
    };
  }, [kioskToken]);

  const query = useQuery({
    queryKey: ['hud', 'shipping-state', kioskToken],
    queryFn: async ({ signal }) => {
      const requestToken = kioskToken;
      const key = tokenKey(requestToken);
      const machine = shippingMachines.get(key) ?? createShippingMachine();
      const url = new URL(
        '/api/hud/shipping-state',
        globalThis.location.origin
      );
      if (kioskToken) url.searchParams.set('kiosk', kioskToken);

      let response: Response;
      try {
        response = await fetch(url, { signal, cache: 'no-store' });
      } catch {
        if (signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const now = Date.now();
        const next = expireShippingStateIfNeeded(
          applyShippingStateRead(machine, { kind: 'disconnected' }, now),
          now
        );
        shippingMachines.set(key, next);
        return snapshotFor(key, next.view, 'error');
      }

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const now = Date.now();
      const next = expireShippingStateIfNeeded(
        applyShippingStateRead(
          machine,
          shippingStateReadFromHttp(response.status, payload),
          now
        ),
        now
      );
      shippingMachines.set(key, next);
      if (response.status === 401 || response.status === 403) {
        lastOperationalTasks.delete(key);
        return snapshotFor(key, next.view, 'error');
      }
      const parsed = response.ok
        ? parseShippingCockpitProjection(payload)
        : null;
      return snapshotFor(
        key,
        next.view,
        parsed ? 'idle' : 'error',
        parsed?.operationalTasks
      );
    },
    ...REALTIME_CACHE,
    placeholderData: (previousData, previousQuery) => {
      if (!previousQuery || previousQuery.queryKey[2] !== kioskToken) {
        return undefined;
      }
      return previousData;
    },
    staleTime: 0,
    gcTime: SHIPPING_STATE_CACHE_GC_MS,
    refetchInterval: SHIPPING_STATE_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
  });

  return {
    view: query.data?.view ?? createEmptyShippingStateView(),
    operationalTasks: query.data?.operationalTasks ?? EMPTY_OPERATIONAL_FEED,
    isPending: query.isPending && !query.data,
    isFetching: query.isFetching,
    operationalRequestState: query.data?.operationalRequestState ?? 'idle',
    refetch: query.refetch,
  };
}
