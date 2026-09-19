'use client';

// @coverage-via apps/web/tests/unit/profile/use-profile-mobile-overflow.test.ts
import { useCallback, useEffect, useRef, useState } from 'react';

const PROFILE_MOBILE_MEDIA_QUERY = '(max-width: 767px)';
const PROFILE_IDENTITY_SELECTOR = '[data-testid="profile-hero-identity-block"]';
const PROFILE_COVER_SELECTOR = '[data-testid="profile-cover"]';

type UseProfileMobileOverflowOptions = Readonly<{
  surface: HTMLDivElement | null;
  isHomeMode: boolean;
  isPreviewEmbedded: boolean;
}>;

/**
 * Enables the public mobile home scroll contract only while natural content
 * is taller than the viewport. The mode is deliberately scoped to one
 * mounted surface so tab changes, breakpoint changes, and content reflow
 * cannot leave the outer shell in a stale scroll layout.
 */
export function useProfileMobileOverflow({
  surface,
  isHomeMode,
  isPreviewEmbedded,
}: UseProfileMobileOverflowOptions): boolean {
  const [isCompactMobileViewport, setIsCompactMobileViewport] = useState(false);
  const [needsOverflowScroll, setNeedsOverflowScroll] = useState(false);
  const overflowModeRef = useRef(false);
  const overflowProbeFrameRef = useRef<number | null>(null);
  const overflowGeometryRef = useRef<string | null>(null);

  const isPublicMobileHome =
    isHomeMode && !isPreviewEmbedded && isCompactMobileViewport;

  const setOverflowMode = useCallback((next: boolean) => {
    setNeedsOverflowScroll(previous => (previous === next ? previous : next));
    overflowModeRef.current = next;
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(PROFILE_MOBILE_MEDIA_QUERY);
    const syncViewport = () => setIsCompactMobileViewport(mediaQuery.matches);

    syncViewport();
    mediaQuery.addEventListener?.('change', syncViewport);
    return () => mediaQuery.removeEventListener?.('change', syncViewport);
  }, []);

  useEffect(() => {
    if (overflowProbeFrameRef.current !== null) {
      cancelAnimationFrame(overflowProbeFrameRef.current);
      overflowProbeFrameRef.current = null;
    }
    overflowGeometryRef.current = null;
    setOverflowMode(false);

    if (!isPublicMobileHome || !surface) {
      return;
    }

    const readContentGeometry = () => {
      const identity = surface.querySelector<HTMLElement>(
        PROFILE_IDENTITY_SELECTOR
      );
      const identityRect = identity?.getBoundingClientRect();
      const cover = surface.querySelector<HTMLElement>(PROFILE_COVER_SELECTOR);
      const coverRect = cover?.getBoundingClientRect();
      return [
        identityRect?.width ?? 0,
        identityRect?.height ?? 0,
        coverRect?.width ?? 0,
        coverRect?.height ?? 0,
      ]
        .map(value => value.toFixed(2))
        .join(':');
    };

    const measureOverflow = () => {
      if (!isPublicMobileHome || overflowModeRef.current) {
        return;
      }

      overflowGeometryRef.current = readContentGeometry();
      setOverflowMode(surface.scrollHeight > surface.clientHeight + 1);
    };

    const scheduleNaturalFlowProbe = () => {
      setOverflowMode(false);
      if (overflowProbeFrameRef.current !== null) {
        cancelAnimationFrame(overflowProbeFrameRef.current);
      }

      overflowProbeFrameRef.current = requestAnimationFrame(() => {
        overflowProbeFrameRef.current = null;
        if (!isPublicMobileHome) {
          return;
        }
        overflowGeometryRef.current = readContentGeometry();
        setOverflowMode(surface.scrollHeight > surface.clientHeight + 1);
      });
    };

    const remeasureAfterResize = () => {
      if (!isPublicMobileHome) {
        setOverflowMode(false);
        return;
      }

      if (!overflowModeRef.current) {
        measureOverflow();
        return;
      }

      // The scroll layout changes surface.clientHeight, so measure natural
      // flow for one animation frame before deciding whether to restore it.
      scheduleNaturalFlowProbe();
    };

    measureOverflow();
    window.addEventListener('resize', remeasureAfterResize);
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        window.removeEventListener('resize', remeasureAfterResize);
        if (overflowProbeFrameRef.current !== null) {
          cancelAnimationFrame(overflowProbeFrameRef.current);
          overflowProbeFrameRef.current = null;
        }
      };
    }

    const observer = new ResizeObserver(() => {
      if (!isPublicMobileHome) {
        return;
      }

      // Let a pending natural-flow probe own the measurement. Otherwise the
      // observer can see pre-probe overflow and immediately restore the mode.
      if (overflowProbeFrameRef.current !== null) {
        return;
      }

      if (!overflowModeRef.current) {
        measureOverflow();
        return;
      }

      // A real identity/media geometry change makes the previous decision
      // stale, so use the same one-frame natural-flow probe as window resize.
      const nextGeometry = readContentGeometry();
      if (nextGeometry !== overflowGeometryRef.current) {
        scheduleNaturalFlowProbe();
      }
    });
    observer.observe(surface);
    const identity = surface.querySelector<HTMLElement>(
      PROFILE_IDENTITY_SELECTOR
    );
    if (identity) {
      observer.observe(identity);
    }

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', remeasureAfterResize);
      if (overflowProbeFrameRef.current !== null) {
        cancelAnimationFrame(overflowProbeFrameRef.current);
        overflowProbeFrameRef.current = null;
      }
    };
  }, [isPublicMobileHome, setOverflowMode, surface]);

  return isPublicMobileHome && needsOverflowScroll;
}
