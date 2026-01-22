'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect, useRef } from 'react';

interface BuildInfo {
  buildId: string;
  deployedAt: number;
  commitSha?: string;
  environment?: string;
}

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const ENDPOINT = '/api/health/build-info';

export function useVersionMonitor() {
  const initialBuildId = useRef<string | null>(null);
  const hasReported = useRef(false);

  useEffect(() => {
    async function fetchBuildInfo(): Promise<BuildInfo | null> {
      try {
        const response = await fetch(ENDPOINT);
        return await response.json();
      } catch (error) {
        console.warn('[version-monitor] Fetch failed:', error);
        return null;
      }
    }

    function hasVersionMismatch(initial: string, current: string): boolean {
      return current !== initial && current !== 'unknown';
    }

    function reportVersionMismatch(data: BuildInfo): void {
      hasReported.current = true;

      Sentry.captureMessage('Build version mismatch detected', {
        level: 'info',
        tags: {
          context: 'version_monitor',
          initialBuildId: initialBuildId.current,
          currentBuildId: data.buildId,
          environment: data.environment,
        },
        extra: {
          commitSha: data.commitSha,
          deployedAt: data.deployedAt,
          userAgent: navigator.userAgent,
          pageLoadTime: Date.now(),
        },
      });

      console.info(
        '[version-monitor] New version detected:',
        `${initialBuildId.current} → ${data.buildId}`
      );
    }

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

      if (hasVersionMismatch(initialBuildId.current, data.buildId)) {
        reportVersionMismatch(data);
      }
    }

    initialize();

    const intervalId = setInterval(() => {
      void checkVersion();
    }, CHECK_INTERVAL);

    return () => clearInterval(intervalId);
  }, []);
}
