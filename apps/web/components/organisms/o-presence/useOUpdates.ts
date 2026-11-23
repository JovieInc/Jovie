'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import {
  countOUpdate,
  type OUpdateSpec,
  oUpdateLabel,
  oUpdateSpecs,
} from '@/lib/ovie/o-updates';

export interface OUpdate {
  /** Increases with every real change, so the view can restart its hold. */
  readonly id: number;
  /** Plain words: "3 changes shipped", or "{n} updates" for several sources. */
  readonly label: string;
  /** Items actually changed, across every source in this update. */
  readonly count: number;
  readonly href: string | undefined;
}

interface Pending {
  readonly spec: OUpdateSpec;
  readonly count: number;
}

/**
 * Surfaces only data that CHANGED. Subscribes to the query cache and compares
 * each opted-in query's data before and after a successful read. The first
 * read is a baseline and a refetch that returns equal data shows nothing.
 * Never fetches, never polls: it only watches reads that already happen.
 */
export function useOUpdates(): {
  readonly update: OUpdate | null;
  readonly clear: () => void;
} {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<ReadonlyMap<string, Pending>>(
    () => new Map()
  );
  const [id, setId] = useState(0);
  const [lastHref, setLastHref] = useState<string | undefined>();

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const baselines = new Map<string, unknown>();
    for (const query of cache.getAll()) {
      if (oUpdateSpecs(query.meta).length && query.state.data !== undefined)
        baselines.set(query.queryHash, query.state.data);
    }
    return cache.subscribe(event => {
      const { query } = event;
      if (event.type === 'removed') {
        baselines.delete(query.queryHash);
        return;
      }
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const specs = oUpdateSpecs(query.meta);
      if (!specs.length) return;
      const next = query.state.data;
      const previous = baselines.get(query.queryHash);
      baselines.set(query.queryHash, next);
      if (previous === undefined) return;
      const changed: Pending[] = [];
      for (const spec of specs) {
        const count = countOUpdate(spec, previous, next);
        if (count > 0) changed.push({ spec, count });
      }
      if (!changed.length) return;
      setPending(current => {
        const merged = new Map(current);
        for (const item of changed) {
          const earlier = merged.get(item.spec.key);
          merged.set(item.spec.key, {
            spec: item.spec,
            count: item.count + (earlier?.count ?? 0),
          });
        }
        return merged;
      });
      setLastHref(changed[changed.length - 1]?.spec.href);
      setId(value => value + 1);
    });
  }, [queryClient]);

  const clear = useCallback(() => setPending(new Map()), []);

  if (!pending.size) return { update: null, clear };
  const items = [...pending.values()];
  const count = items.reduce((sum, item) => sum + item.count, 0);
  const only = items.length === 1 ? items[0] : undefined;
  return {
    update: {
      id,
      count,
      label: only
        ? oUpdateLabel(only.spec, only.count)
        : `${count} ${count === 1 ? 'update' : 'updates'}`,
      href: only ? only.spec.href : lastHref,
    },
    clear,
  };
}
