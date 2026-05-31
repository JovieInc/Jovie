'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { isElectronRuntime } from '@/lib/desktop/electron-bridge';
import { STABLE_CACHE } from '@/lib/queries/cache-strategies';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — per spec, do not poll more often

interface VersionResponse {
  buildId: string;
}

export interface WebUpdateState {
  /** True when the server's build hash has drifted from the initial value. */
  readonly available: boolean;
  /** Reload the page to pick up the new build. */
  readonly reload: () => void;
}

/**
 * useWebUpdate — polls /api/version every 5 minutes via TanStack Query.
 *
 * Unified behind stable query key + cache preset (refetchOnMount:false for
 * shell chrome) so concurrent/remounting consumers (titlebar, header, nav
 * during route transitions) dedupe to a single network request.
 *
 * On first data it captures the initial buildId. Subsequent data compares
 * against baseline; if they diverge, `available` flips to true.
 * Hook is a no-op when running inside Electron.
 */
export function useWebUpdate(): WebUpdateState {
  const [available, setAvailable] = useState(false);
  const initialBuildId = useRef<string | null>(null);
  const isElectron = isElectronRuntime();

  const { data: buildId } = useQuery({
    queryKey: ['web-version', 'buildId'] as const,
    queryFn: async ({ signal }): Promise<string | null> => {
      try {
        const res = await fetch('/api/version', {
          cache: 'no-store',
          signal,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as VersionResponse;
        return data.buildId ?? null;
      } catch {
        return null;
      }
    },
    enabled: !isElectron,
    // Use STABLE_CACHE base (refetchOnMount:false, no focus) + polling override.
    // This prevents duplicate /api/version fetches from shell chrome remounts
    // across dashboard inner route transitions (JOV-2201).
    ...STABLE_CACHE,
    staleTime: POLL_INTERVAL_MS,
    gcTime: POLL_INTERVAL_MS * 2,
    // Once drift is detected and the pill is shown, stop recurring polls.
    refetchInterval: available ? false : POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!buildId) return;

    if (initialBuildId.current === null) {
      // First data — capture baseline
      initialBuildId.current = buildId;
      return;
    }

    if (buildId !== initialBuildId.current) {
      setAvailable(true);
    }
  }, [buildId]);

  const reload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return { available, reload };
}
