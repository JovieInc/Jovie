'use client';

import { useEffect, useMemo, useState } from 'react';

type PauseReason = 'page-hidden' | 'sidebar-open';

export interface PollingManagerOptions {
  isSidebarOpen?: boolean;
  pauseWhenHidden?: boolean;
}

export interface PollingManagerState {
  isPageVisible: boolean;
  isSidebarOpen: boolean;
  isPaused: boolean;
  pauseReasons: PauseReason[];
}

/**
 * Returns a TanStack Query-compatible `refetchInterval` value that pauses
 * polling when the page is hidden or a sidebar is open.
 *
 * @param baseInterval - The desired polling interval in ms (e.g. 2000).
 * @param options - Visibility / sidebar options forwarded to `usePollingManager`.
 * @returns `baseInterval` when polling should be active, `false` when paused.
 *
 * @example
 * ```tsx
 * const refetchInterval = useSmartRefetchInterval(5000, { isSidebarOpen });
 * useQuery({ queryKey: ['data'], queryFn: fetchData, refetchInterval });
 * ```
 */
export function useSmartRefetchInterval(
  baseInterval: number,
  options: PollingManagerOptions = {}
): number | false {
  const { isPaused } = usePollingManager(options);
  return isPaused ? false : baseInterval;
}

export function usePollingManager({
  isSidebarOpen = false,
  pauseWhenHidden = true,
}: PollingManagerOptions): PollingManagerState {
  const [isPageVisible, setIsPageVisible] = useState(() => {
    if (typeof document === 'undefined') {
      return true;
    }
    return document.visibilityState === 'visible';
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const pauseReasons = useMemo<PauseReason[]>(() => {
    const reasons: PauseReason[] = [];
    if (pauseWhenHidden && !isPageVisible) {
      reasons.push('page-hidden');
    }
    if (isSidebarOpen) {
      reasons.push('sidebar-open');
    }
    return reasons;
  }, [isPageVisible, isSidebarOpen, pauseWhenHidden]);

  const isPaused = pauseReasons.length > 0;

  return {
    isPageVisible,
    isSidebarOpen,
    isPaused,
    pauseReasons,
  };
}
