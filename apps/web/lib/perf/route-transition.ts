'use client';

// Route-transition latency instrumentation for the authenticated shell.
//
// Captures perceived route-transition latency: the time from a nav-intent
// click on an internal `<a>` link to the next route's first painted frame
// (double `requestAnimationFrame` after the pathname changes). This is the
// metric every later One App Shell perf chunk is judged against.
//
// Privacy: only route IDs are emitted (dynamic segments like ids/uuids are
// redacted to `:id`), never raw pathnames with user data, and never query
// strings (Next's `usePathname()` already excludes the query string).

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { track } from '@/lib/analytics';
import { logger } from '@/lib/utils/logger';

const MEASURE_NAME = 'route_transition';
const MARK_PREFIX = 'route-transition:intent';

export interface RouteTransitionPayload {
  readonly fromRoute: string;
  readonly toRoute: string;
  readonly durationMs: number;
}

interface PendingRouteTransition {
  readonly fromRoute: string;
  readonly markName: string;
}

let pendingTransition: PendingRouteTransition | null = null;
let markSequence = 0;

function canUsePerformanceApi(): boolean {
  return (
    typeof performance !== 'undefined' &&
    typeof performance.mark === 'function' &&
    typeof performance.measure === 'function'
  );
}

/**
 * Redact dynamic path segments (numeric ids, UUIDs, long opaque tokens) so
 * the emitted route id never carries user-identifying data.
 */
export function toRouteId(pathname: string): string {
  if (!pathname) {
    return '/';
  }

  const segments = pathname.split('/').map(segment => {
    if (segment.length === 0) {
      return segment;
    }
    return isDynamicSegment(segment) ? ':id' : segment;
  });

  const routeId = segments.join('/');
  return routeId.length > 0 ? routeId : '/';
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_ID_PATTERN = /^\d+$/;
const OPAQUE_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{16,}$/;

function isDynamicSegment(segment: string): boolean {
  if (UUID_PATTERN.test(segment)) {
    return true;
  }
  if (NUMERIC_ID_PATTERN.test(segment)) {
    return true;
  }
  // Long opaque alphanumeric tokens (cuid/nanoid/etc). Require at least one
  // digit so ordinary route words (e.g. "dashboard", "notifications") are
  // never mistaken for an id.
  return OPAQUE_TOKEN_PATTERN.test(segment) && /\d/.test(segment);
}

/**
 * Mark the start of a route-transition interaction. Call this at nav
 * intent (e.g. an internal link click) with the CURRENT pathname.
 */
export function markRouteTransitionIntent(currentPathname: string): void {
  if (!canUsePerformanceApi()) {
    return;
  }

  markSequence += 1;
  const markName = `${MARK_PREFIX}:${markSequence}`;

  try {
    performance.mark(markName);
  } catch {
    return;
  }

  pendingTransition = {
    fromRoute: toRouteId(currentPathname),
    markName,
  };
}

/**
 * Complete a pending route transition once the pathname has changed. Waits
 * two animation frames (the standard "next paint has committed" signal) past
 * the pathname change before measuring, so the duration reflects perceived
 * paint latency rather than just the pathname commit.
 */
export function completeRouteTransition(nextPathname: string): void {
  if (!pendingTransition) {
    return;
  }

  const toRoute = toRouteId(nextPathname);
  if (toRoute === pendingTransition.fromRoute) {
    // Pathname didn't actually change (e.g. hash-only navigation) — keep
    // waiting for a real route change instead of reporting a zero-length
    // transition.
    return;
  }

  const { fromRoute, markName } = pendingTransition;
  pendingTransition = null;

  if (!canUsePerformanceApi() || typeof requestAnimationFrame !== 'function') {
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      finishMeasurement({ fromRoute, toRoute, markName });
    });
  });
}

function finishMeasurement({
  fromRoute,
  toRoute,
  markName,
}: {
  fromRoute: string;
  toRoute: string;
  markName: string;
}): void {
  if (!canUsePerformanceApi()) {
    return;
  }

  try {
    const measure = performance.measure(
      `${MEASURE_NAME}:${fromRoute}->${toRoute}`,
      markName
    );
    reportRouteTransition({
      fromRoute,
      toRoute,
      durationMs: Math.round(measure.duration),
    });
  } catch {
    // The mark may already have been cleared (e.g. StrictMode double-invoke
    // or an unrelated performance buffer reset). Never throw from telemetry.
  } finally {
    try {
      performance.clearMarks(markName);
    } catch {
      // ignore
    }
  }
}

function reportRouteTransition(payload: RouteTransitionPayload): void {
  logger.debug(`[${MEASURE_NAME}]`, payload);
  track(MEASURE_NAME, {
    fromRoute: payload.fromRoute,
    toRoute: payload.toRoute,
    durationMs: payload.durationMs,
  });
}

function isInternalNavClick(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) {
    return false;
  }
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }

  const anchor = target.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) {
    return false;
  }
  if (anchor.target === '_blank' || anchor.hasAttribute('download')) {
    return false;
  }

  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('mailto:')) {
    return false;
  }

  // Only same-origin, app-relative links count as an in-shell route
  // transition. External/absolute links leave the app entirely.
  return href.startsWith('/');
}

/**
 * Mount once inside the authenticated shell root. Listens for internal link
 * clicks (nav intent) and measures perceived latency to the next route's
 * committed paint whenever `usePathname()` changes.
 *
 * Zero overhead when idle: a single delegated click listener plus one
 * `useEffect` comparing the previous pathname; no layout reads.
 */
export function useRouteTransitionTelemetry(): void {
  const pathname = usePathname() ?? '/';
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    if (pathnameRef.current !== pathname) {
      pathnameRef.current = pathname;
      completeRouteTransition(pathname);
    }
  }, [pathname]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (isInternalNavClick(event)) {
        markRouteTransitionIntent(pathnameRef.current);
      }
    }

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, []);
}

/** Test-only: reset module state between test cases. */
export function __resetRouteTransitionStateForTests(): void {
  pendingTransition = null;
  markSequence = 0;
}
