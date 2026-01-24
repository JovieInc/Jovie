'use client';

import * as Sentry from '@sentry/nextjs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { queryKeys } from './keys';

export interface BuildInfo {
  buildId: string;
  deployedAt: number;
  commitSha?: string;
  environment?: string;
}

export interface VersionMismatchInfo {
  previousBuildId: string;
  currentBuildId: string;
  commitSha?: string;
  environment?: string;
}

const POLLING_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch build info from the health endpoint.
 */
export async function fetchBuildInfo({
  signal,
}: {
  signal?: AbortSignal;
}): Promise<BuildInfo | null> {
  try {
    const response = await fetch('/api/health/build-info', { signal });
    if (!response.ok) return null;
    return (await response.json()) as BuildInfo;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error; // Let TanStack Query handle cancellation
    }
    Sentry.addBreadcrumb({
      category: 'version-monitor',
      message: 'Fetch failed',
      level: 'warning',
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return null;
  }
}

/**
 * TanStack Query hook for polling build info.
 *
 * Used internally by `useVersionMonitor` to poll for version changes.
 *
 * @example
 * const { data: buildInfo } = useBuildInfoQuery({ enabled: true });
 */
export function useBuildInfoQuery(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  return useQuery({
    queryKey: queryKeys.health.buildInfo(),
    queryFn: fetchBuildInfo,
    enabled,
    staleTime: POLLING_INTERVAL,
    refetchInterval: POLLING_INTERVAL,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export interface UseVersionMonitorOptions {
  onVersionMismatch?: (info: VersionMismatchInfo) => void;
  enabled?: boolean;
}

export interface UseVersionMonitorResult {
  hasMismatch: boolean;
  mismatchInfo: VersionMismatchInfo | null;
  checkNow: () => Promise<boolean>;
}

/**
 * Version monitor hook using TanStack Query for polling.
 *
 * Detects when a new version is deployed and notifies the user.
 * Uses TanStack Query's built-in polling instead of manual setInterval.
 *
 * @example
 * const { hasMismatch, mismatchInfo } = useVersionMonitor({
 *   onVersionMismatch: (info) => {
 *     toast.info('A new version is available');
 *   },
 * });
 */
export function useVersionMonitor(
  options?: UseVersionMonitorOptions
): UseVersionMonitorResult {
  const { onVersionMismatch, enabled = true } = options ?? {};
  const queryClient = useQueryClient();

  const initialBuildId = useRef<string | null>(null);
  const hasReported = useRef(false);

  const [hasMismatch, setHasMismatch] = useState(false);
  const [mismatchInfo, setMismatchInfo] = useState<VersionMismatchInfo | null>(
    null
  );

  const { data: buildInfo } = useBuildInfoQuery({ enabled });

  // Store initial build ID on first successful fetch
  useEffect(() => {
    if (!buildInfo || initialBuildId.current) return;
    initialBuildId.current = buildInfo.buildId;
  }, [buildInfo]);

  // Detect version changes
  useEffect(() => {
    if (
      !buildInfo ||
      !initialBuildId.current ||
      hasReported.current ||
      buildInfo.buildId === 'unknown'
    ) {
      return;
    }

    if (buildInfo.buildId !== initialBuildId.current) {
      hasReported.current = true;

      const info: VersionMismatchInfo = {
        previousBuildId: initialBuildId.current,
        currentBuildId: buildInfo.buildId,
        commitSha: buildInfo.commitSha,
        environment: buildInfo.environment,
      };

      setHasMismatch(true);
      setMismatchInfo(info);

      Sentry.addBreadcrumb({
        category: 'version-monitor',
        message: `New version detected: ${initialBuildId.current} → ${buildInfo.buildId}`,
        level: 'info',
        data: info,
      });

      onVersionMismatch?.(info);
    }
  }, [buildInfo, onVersionMismatch]);

  const checkNow = useCallback(async (): Promise<boolean> => {
    const data = await queryClient.fetchQuery({
      queryKey: queryKeys.health.buildInfo(),
      queryFn: fetchBuildInfo,
    });

    if (!data) return false;

    if (!initialBuildId.current) {
      initialBuildId.current = data.buildId;
      return false;
    }

    if (data.buildId !== initialBuildId.current && data.buildId !== 'unknown') {
      // Will be picked up by the effect above
      return true;
    }

    return false;
  }, [queryClient]);

  return { hasMismatch, mismatchInfo, checkNow };
}
