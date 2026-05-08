'use client';

import { useEffect, useRef, useState } from 'react';

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // In Electron, skip web polling — desktop path handles updates
    if (
      typeof window !== 'undefined' &&
      'electronAPI' in window &&
      window.electronAPI != null
    ) {
      return;
    }

    let cancelled = false;

    async function fetchBuildId(): Promise<string | null> {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return null;
        const data = (await res.json()) as VersionResponse;
        return data.buildId ?? null;
      } catch {
        return null;
      }
    }

    async function poll() {
      if (cancelled) return;
      const buildId = await fetchBuildId();
      if (cancelled || buildId == null) return;

      if (initialBuildId.current === null) {
        // First poll — capture baseline
        initialBuildId.current = buildId;
        return;
      }

      if (buildId !== initialBuildId.current) {
        setAvailable(true);
        // Stop polling once we've detected drift
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }

    // Kick off initial capture, then schedule recurring polls
    void poll();
    intervalRef.current = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const reload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return { available, reload };
}
