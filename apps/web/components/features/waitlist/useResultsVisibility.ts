'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const HIDE_GRACE_MS = 150;

/**
 * Visibility state for the artist-search results dropdown.
 *
 * `show` opens it immediately and `hideNow` closes it immediately;
 * `scheduleHide` closes it after a short grace period so a fast click on a
 * result can still land after blur. The pending grace timer is tracked and
 * cleared on unmount, so the deferred state update can never fire after the
 * DOM environment is gone (vitest teardown: unhandled
 * `ReferenceError: window is not defined`), and every show/hide supersedes
 * any pending timer.
 */
export function useResultsVisibility() {
  const [showResults, setShowResults] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingHide = useCallback(() => {
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      cancelPendingHide();
    },
    [cancelPendingHide]
  );

  const show = useCallback(() => {
    cancelPendingHide();
    setShowResults(true);
  }, [cancelPendingHide]);

  const hideNow = useCallback(() => {
    cancelPendingHide();
    setShowResults(false);
  }, [cancelPendingHide]);

  const scheduleHide = useCallback(() => {
    cancelPendingHide();
    hideTimeoutRef.current = setTimeout(() => {
      hideTimeoutRef.current = null;
      setShowResults(false);
    }, HIDE_GRACE_MS);
  }, [cancelPendingHide]);

  return { showResults, show, hideNow, scheduleHide };
}
