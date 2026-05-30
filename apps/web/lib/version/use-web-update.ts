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
 * useWebUpdate — polls /api/version every 5 minutes.
 *
 * On first mount it captures the initial buildId. Subsequent polls compare
 * against that baseline; if they diverge, `available` flips to true.
 *
 * Polling stops once an update is detected (no need to keep polling).
 * Hook is a no-op when running inside Electron (window.electronAPI exists),
 * since the desktop update path is handled by electron-updater.
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
