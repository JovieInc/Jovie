'use client';

/**
 * React binding for the PAC instrumentation layer — spec §8 (issue #13063).
 *
 * Gives PAC surfaces:
 * - `exposureRef` — attach to the PAC container; fires `pac_exposure` when
 *   the element is ≥50% visible, once per PAC state per session.
 * - `emit` — consent-aware, variant-keyed emitter for the remaining client
 *   events (`pac_play_*`, `capture_*`, `pac_secondary_click`).
 * - `createPlayTracker` — play milestone tracker (`pac_play_start`,
 *   `pac_play_30s`, `pac_play_complete`) for one track.
 *
 * The PAC state machine component (#13061) drives `state`; today's rail
 * mounts it in the resting `idle` state for exposure denominators.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ProfilePacAssignment } from '@/lib/flags/profile-pac';
import {
  createPacPlayMilestoneTracker,
  type PacPlayMilestoneTracker,
  trackPacClientEvent,
  trackPacExposure,
} from '@/lib/tracking/pac-events';
import {
  buildPacVariantId,
  type PacClientEventName,
  type PacEventExtras,
  type PacState,
} from '@/lib/tracking/pac-events-contract';

const EXPOSURE_VISIBILITY_THRESHOLD = 0.5;
const EXPOSURE_OBSERVER_THRESHOLDS = [0, 0.25, 0.5];

/**
 * "≥50% visible" per spec §8 — with the standard tall-element handling: an
 * element taller than the viewport can never reach a 0.5 intersection
 * ratio, so it also counts as exposed when its visible portion fills ≥50%
 * of the viewport.
 */
function isPacExposureVisible(entry: IntersectionObserverEntry): boolean {
  if (!entry.isIntersecting) return false;
  if (entry.intersectionRatio >= EXPOSURE_VISIBILITY_THRESHOLD) return true;

  const viewportHeight =
    entry.rootBounds?.height ??
    (globalThis.window === undefined ? 0 : globalThis.window.innerHeight);
  if (viewportHeight <= 0) return false;

  return (
    entry.intersectionRect.height >=
    viewportHeight * EXPOSURE_VISIBILITY_THRESHOLD
  );
}

export interface UsePacEventsOptions {
  /** The artist/profile uuid the PAC belongs to. */
  readonly profileId: string;
  /** The visitor's PAC experiment assignment (all three slots). */
  readonly assignment: ProfilePacAssignment;
  /** Current PAC state machine state; defaults to the resting state. */
  readonly state?: PacState;
  /** Disable for preview/non-interactive renders. */
  readonly enabled?: boolean;
}

export interface PacEventsApi {
  /** Combined experiment arm key attached to every event. */
  readonly variantId: string;
  /** Callback ref — attach to the PAC container for exposure tracking. */
  readonly exposureRef: (node: Element | null) => void;
  /** Emits one PAC client event in the current (or overridden) state. */
  readonly emit: (
    event: PacClientEventName,
    extras?: PacEventExtras,
    stateOverride?: PacState
  ) => void;
  /** Creates a play milestone tracker bound to this PAC context. */
  readonly createPlayTracker: () => PacPlayMilestoneTracker;
}

export function usePacEvents({
  profileId,
  assignment,
  state = 'idle',
  enabled = true,
}: UsePacEventsOptions): PacEventsApi {
  const variantId = useMemo(() => buildPacVariantId(assignment), [assignment]);

  const stateRef = useRef<PacState>(state);
  const isVisibleRef = useRef(false);
  useEffect(() => {
    stateRef.current = state;
    // When the PAC state machine advances while already ≥50% visible,
    // re-emit exposure for the new state (once-per-state dedup still applies).
    if (enabled && isVisibleRef.current) {
      trackPacExposure({
        profileId,
        variantId,
        pacState: state,
      });
    }
  }, [enabled, profileId, state, variantId]);

  const emit = useCallback(
    (
      event: PacClientEventName,
      extras?: PacEventExtras,
      stateOverride?: PacState
    ) => {
      if (!enabled) return;
      trackPacClientEvent(
        event,
        {
          profileId,
          variantId,
          pacState: stateOverride ?? stateRef.current,
        },
        extras
      );
    },
    [enabled, profileId, variantId]
  );

  const observerRef = useRef<IntersectionObserver | null>(null);

  const exposureRef = useCallback(
    (node: Element | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      isVisibleRef.current = false;

      if (!node || !enabled) return;
      if (typeof IntersectionObserver === 'undefined') return;

      const observer = new IntersectionObserver(
        entries => {
          for (const entry of entries) {
            const visible = isPacExposureVisible(entry);
            isVisibleRef.current = visible;
            if (visible) {
              // Once-per-state-per-session dedup lives in trackPacExposure.
              trackPacExposure({
                profileId,
                variantId,
                pacState: stateRef.current,
              });
            }
          }
        },
        { threshold: EXPOSURE_OBSERVER_THRESHOLDS }
      );
      observer.observe(node);
      observerRef.current = observer;
    },
    [enabled, profileId, variantId]
  );

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    },
    []
  );

  const createPlayTracker = useCallback(
    () => createPacPlayMilestoneTracker((event, extras) => emit(event, extras)),
    [emit]
  );

  return { variantId, exposureRef, emit, createPlayTracker };
}
