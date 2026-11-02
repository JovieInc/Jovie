'use client';

import { useEffect, useRef } from 'react';
import {
  ovieHomeReadySample,
  ovieHomeStart,
  recordOvieHomeReady,
} from '@/lib/ovie/home/home-ready-timing';

/** True once any Ovie Home has mounted in this document. */
let homeMountedInDocument = false;

function documentPath(): string | null {
  try {
    const entry = globalThis.performance?.getEntriesByType?.('navigation')[0];
    return entry ? new URL(entry.name).pathname : null;
  } catch {
    return null;
  }
}

/**
 * Records Ovie Home first meaningful paint once per mount: from navigation
 * start (or Home mount on client navigation) until `ready` first turns true.
 */
export function useOvieHomeReadyTiming(ready: boolean): void {
  const start = useRef<ReturnType<typeof ovieHomeStart> | null>(null);
  const recorded = useRef(false);

  useEffect(() => {
    const now = globalThis.performance?.now?.();
    if (now === undefined) return;
    start.current = ovieHomeStart({
      mountedAt: now,
      firstMountInDocument: !homeMountedInDocument,
      documentPath: documentPath(),
      currentPath: globalThis.location?.pathname ?? null,
    });
    homeMountedInDocument = true;
  }, []);

  useEffect(() => {
    if (!ready || recorded.current || !start.current) return;
    recorded.current = true;
    const { startedAt, navigation } = start.current;
    recordOvieHomeReady(
      ovieHomeReadySample(startedAt, globalThis.performance.now(), navigation)
    );
  }, [ready]);
}

/** Test seam: forget earlier mounts so each test starts as a fresh document. */
export function resetOvieHomeReadyTimingForTests(): void {
  homeMountedInDocument = false;
}
