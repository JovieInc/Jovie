'use client';

import { useEffect, useRef, useState } from 'react';
import { useBuildInfoQuery } from '@/lib/queries';

export interface WebUpdateState {
  /** True when the server's build hash has drifted from the initial value. */
  readonly available: boolean;
  /** Reload the page to pick up the new build. */
  readonly reload: () => void;
}

/**
 * useWebUpdate — uses the shared build-info query (via TanStack, 5min poll)
 * to detect web deployments without causing duplicate /api/version or
 * /api/health/build-info calls on shell chrome remounts.
 *
 * Delegates to the stable-key useBuildInfoQuery (STATIC_CACHE semantics
 * via its internals + shell persistence keeps the query mounted).
 * On first mount captures baseline; drift sets available.
 *
 * No-op in Electron.
 */
export function useWebUpdate(): WebUpdateState {
  const [available, setAvailable] = useState(false);
  const initialBuildId = useRef<string | null>(null);

  // In Electron, skip web polling — desktop path handles updates
  const isElectron =
    typeof window !== 'undefined' &&
    'electronAPI' in window &&
    window.electronAPI != null;

  const { data: buildInfo } = useBuildInfoQuery({ enabled: !isElectron });

  useEffect(() => {
    if (isElectron || !buildInfo?.buildId) {
      return;
    }

    if (initialBuildId.current === null) {
      initialBuildId.current = buildInfo.buildId;
      return;
    }

    if (buildInfo.buildId !== initialBuildId.current) {
      setAvailable(true);
    }
  }, [buildInfo, isElectron]);

  const reload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return { available, reload };
}
