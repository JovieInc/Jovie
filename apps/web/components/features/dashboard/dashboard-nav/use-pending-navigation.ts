'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NAVIGATION_DROP_OFF_MS } from '@/lib/tracking/navigation-telemetry';

/**
 * Paint-only "you clicked this" acknowledgment for rail destinations,
 * extracted from DashboardNav. One record at a time; it ends when the URL
 * commits (after a minimum visible window), on connectivity loss, or on the
 * telemetry drop-off window when a transition never commits.
 */
export interface PendingNavigationRecord {
  readonly itemId: string;
  readonly startedAt: number;
}

// The paint-only nav acknowledgment stays visible for a minimum window so it
// is observable even when a prefetched route commits the URL almost
// immediately. A transition that fails without committing a URL recovers on
// the same drop-off window navigation telemetry uses instead of sticking.
const PENDING_NAVIGATION_MIN_VISIBLE_MS = 400;
const PENDING_NAVIGATION_RECOVERY_MS = NAVIGATION_DROP_OFF_MS;

export function usePendingNavigation(currentNavigationHref: string) {
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigationRecord | null>(null);
  const pendingNavigationTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(
    new Set()
  );
  const previousNavigationHrefRef = useRef(currentNavigationHref);

  const schedulePendingNavigationClear = useCallback(
    (record: PendingNavigationRecord, delayMs: number) => {
      const timer = setTimeout(() => {
        pendingNavigationTimersRef.current.delete(timer);
        setPendingNavigation(current => (current === record ? null : current));
      }, delayMs);
      pendingNavigationTimersRef.current.add(timer);
    },
    []
  );

  const beginPendingNavigation = useCallback(
    (itemId: string) => {
      const record: PendingNavigationRecord = {
        itemId,
        startedAt: Date.now(),
      };
      setPendingNavigation(record);
      schedulePendingNavigationClear(record, PENDING_NAVIGATION_RECOVERY_MS);
    },
    [schedulePendingNavigationClear]
  );

  const cancelPendingNavigation = useCallback((itemId: string) => {
    setPendingNavigation(current =>
      current?.itemId === itemId ? null : current
    );
  }, []);

  // Route segments keep authenticated content mounted during a warm
  // transition, so the committed URL — not a loading surface — is what ends
  // the acknowledgment. Hold the pending state for a minimum visible window
  // once the URL commits so fast prefetched transitions still expose it.
  useEffect(() => {
    const hrefChanged =
      previousNavigationHrefRef.current !== currentNavigationHref;
    previousNavigationHrefRef.current = currentNavigationHref;
    if (!hrefChanged || !pendingNavigation) return;

    const remainingMs =
      PENDING_NAVIGATION_MIN_VISIBLE_MS -
      (Date.now() - pendingNavigation.startedAt);
    if (remainingMs <= 0) {
      setPendingNavigation(null);
    } else {
      schedulePendingNavigationClear(pendingNavigation, remainingMs);
    }
  }, [
    currentNavigationHref,
    pendingNavigation,
    schedulePendingNavigationClear,
  ]);

  useEffect(
    () => () => {
      for (const timer of pendingNavigationTimersRef.current) {
        clearTimeout(timer);
      }
      pendingNavigationTimersRef.current.clear();
    },
    []
  );

  // Connectivity loss can retain the source URL. Clear its acknowledgment
  // immediately; the existing per-navigation recovery timer remains bounded.
  useEffect(() => {
    if (!pendingNavigation) return;
    const clearAcknowledgment = () => setPendingNavigation(null);
    globalThis.addEventListener('offline', clearAcknowledgment);
    return () => globalThis.removeEventListener('offline', clearAcknowledgment);
  }, [pendingNavigation]);

  return {
    pendingNavigation,
    beginPendingNavigation,
    cancelPendingNavigation,
  } as const;
}
