'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface BuildInfo {
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

export interface UseVersionMonitorOptions {
  onVersionMismatch?: (info: VersionMismatchInfo) => void;
  enabled?: boolean;
}

export interface UseVersionMonitorResult {
  hasMismatch: boolean;
  mismatchInfo: VersionMismatchInfo | null;
  checkNow: () => Promise<boolean>;
}

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const ENDPOINT = '/api/health/build-info';

function hasVersionChanged(initial: string, current: string): boolean {
  return current !== initial && current !== 'unknown';
}

export async function fetchBuildInfo(): Promise<BuildInfo | null> {
  try {
    const response = await fetch(ENDPOINT);
    return await response.json();
  } catch (error) {
    console.warn('[version-monitor] Fetch failed:', error);
    return null;
  }
}

export function useVersionMonitor(
  options?: UseVersionMonitorOptions
): UseVersionMonitorResult {
  const { onVersionMismatch, enabled = true } = options ?? {};
  const initialBuildId = useRef<string | null>(null);
  const hasReported = useRef(false);
  const [hasMismatch, setHasMismatch] = useState(false);
  const [mismatchInfo, setMismatchInfo] = useState<VersionMismatchInfo | null>(
    null
  );

  const reportVersionMismatch = useCallback(
    (data: BuildInfo): void => {
      if (hasReported.current) return;
      hasReported.current = true;

      const info: VersionMismatchInfo = {
        previousBuildId: initialBuildId.current!,
        currentBuildId: data.buildId,
        commitSha: data.commitSha,
        environment: data.environment,
      };

      setHasMismatch(true);
      setMismatchInfo(info);

      console.info(
        '[version-monitor] New version detected:',
        `${initialBuildId.current} → ${data.buildId}`
      );

      onVersionMismatch?.(info);
    },
    [onVersionMismatch]
  );

  const checkNow = useCallback(async (): Promise<boolean> => {
    if (!initialBuildId.current) {
      const data = await fetchBuildInfo();
      if (data) {
        initialBuildId.current = data.buildId;
      }
      return false;
    }

    const data = await fetchBuildInfo();
    if (!data) return false;

    if (hasVersionChanged(initialBuildId.current, data.buildId)) {
      reportVersionMismatch(data);
      return true;
    }
    return false;
  }, [hasVersionChanged, reportVersionMismatch]);

  useEffect(() => {
    if (!enabled) return;

    async function initialize(): Promise<void> {
      const data = await fetchBuildInfo();
      if (data) {
        initialBuildId.current = data.buildId;
      }
    }

    async function checkVersion(): Promise<void> {
      if (!initialBuildId.current || hasReported.current) {
        return;
      }

      const data = await fetchBuildInfo();
      if (!data) {
        return;
      }

      if (hasVersionChanged(initialBuildId.current, data.buildId)) {
        reportVersionMismatch(data);
      }
    }

    initialize();

    const intervalId = setInterval(() => {
      void checkVersion();
    }, CHECK_INTERVAL);

    return () => clearInterval(intervalId);
  }, [enabled, hasVersionChanged, reportVersionMismatch]);

  return { hasMismatch, mismatchInfo, checkNow };
}
