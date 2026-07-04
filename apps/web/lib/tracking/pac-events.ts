/**
 * PAC (Primary Action Card) client emitter — spec §8 (issue #13063).
 *
 * Consent-aware, variant-keyed event emission for the PAC surface. Every
 * event flows through two existing paths (no new tracking surface):
 *
 * 1. `track()` — the existing GA4 client path (gated by Google Consent Mode).
 * 2. `postJsonBeacon()` — fire-and-forget beacon to the first-party sink at
 *    `/api/profile/pac-event`, which enriches `jv_aid` server-side from the
 *    httpOnly cookie (consent permitting) and logs the event to Statsig for
 *    the experiment auto-promotion loop.
 *
 * Exposure events are deduplicated once per PAC state per session.
 */

import { track } from '@/lib/analytics';
import { publicEnv } from '@/lib/env-public';
import { getConsentState } from '@/lib/tracking/consent';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';
import {
  buildPacVariantId,
  PAC_CLIENT_EVENTS,
  PAC_EVENT_ENDPOINT,
  PAC_STATES,
  type PacClientEventName,
  type PacEventExtras,
  type PacEventPayload,
  type PacState,
} from '@/lib/tracking/pac-events-contract';

const SESSION_ID_STORAGE_KEY = 'jv_pac_session';
const EXPOSURE_STORAGE_PREFIX = 'jv_pac_exposed';

/** Context every PAC event is emitted against. */
export interface PacEventContext {
  readonly profileId: string;
  readonly variantId: string;
  readonly pacState: PacState;
}

function readSessionStorage(key: string): string | null {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? null;
  } catch {
    // sessionStorage access can throw in restricted contexts (JOV-848).
    return null;
  }
}

function writeSessionStorage(key: string, value: string): void {
  try {
    globalThis.sessionStorage?.setItem(key, value);
  } catch {
    // Best-effort — dedup degrades to per-render when storage is blocked.
  }
}

function generateUuid(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // Fall through to the non-crypto fallback below.
  }
<<<<<<< HEAD
  const suffix = Math.random().toString(36).slice(2, 12);
=======
  const suffix = Math.random().toString(36).slice(2, 12); // NOSONAR (S2245) - Non-security use: fallback session-ID suffix when crypto.randomUUID is unavailable
>>>>>>> origin/main
  return `${Date.now().toString(36)}-${suffix}`;
}

/**
 * Per-tab PAC session id (uuid), persisted in sessionStorage so all events
 * within one visit share a `session_id`.
 */
export function getPacSessionId(): string {
  const existing = readSessionStorage(SESSION_ID_STORAGE_KEY);
  if (existing) return existing;

  const sessionId = generateUuid();
  writeSessionStorage(SESSION_ID_STORAGE_KEY, sessionId);
  return sessionId;
}

function exposureKey(profileId: string, state: PacState): string {
  return `${EXPOSURE_STORAGE_PREFIX}:${profileId}:${state}`;
}

/** Whether `pac_exposure` already fired for this profile+state this session. */
export function hasTrackedPacExposure(
  profileId: string,
  state: PacState
): boolean {
  return readSessionStorage(exposureKey(profileId, state)) === '1';
}

function markPacExposureTracked(profileId: string, state: PacState): void {
  writeSessionStorage(exposureKey(profileId, state), '1');
}

/**
 * Emits one PAC event through both existing analytics paths.
 *
 * `jv_aid` is always `null` on the client — the cookie is httpOnly by
 * design. The first-party sink is authoritative for identity joining and
 * only attaches `jv_aid` when the consent state permits.
 *
 * Returns the emitted payload (useful for tests), or `null` during SSR.
 */
export function trackPacClientEvent(
  event: PacClientEventName,
  context: PacEventContext,
  extras?: PacEventExtras
): PacEventPayload | null {
  if (globalThis.window === undefined) return null;

  const payload: PacEventPayload = {
    event,
    jv_aid: null,
    profile_id: context.profileId,
    pac_state: context.pacState,
    variant_id: context.variantId,
    session_id: getPacSessionId(),
    consent: getConsentState(),
    ts: Date.now(),
    ...(extras ? { extras } : {}),
  };

  // Existing GA4 path — Google Consent Mode gates delivery.
  track(event, { ...payload });

  // First-party sink — enriches jv_aid server-side, feeds Statsig arm metrics.
  postJsonBeacon(PAC_EVENT_ENDPOINT, payload);

  return payload;
}

/**
 * Emits `pac_exposure` at most once per PAC state per session (spec §8:
 * "≥50% visible, once per state per session"). Visibility detection is the
 * caller's job (see `usePacEvents`).
 */
export function trackPacExposure(
  context: PacEventContext,
  extras?: PacEventExtras
): PacEventPayload | null {
  if (globalThis.window === undefined) return null;
  if (hasTrackedPacExposure(context.profileId, context.pacState)) return null;

  markPacExposureTracked(context.profileId, context.pacState);
  return trackPacClientEvent('pac_exposure', context, extras);
}

const PLAY_MILESTONE_MS = 30_000;

export interface PacPlayMilestoneTracker {
  /** Call when playback starts or resumes. */
  readonly onPlay: () => void;
  /** Call when playback pauses. */
  readonly onPause: () => void;
  /** Call on playback time updates to detect the 30s milestone. */
  readonly onTick: () => void;
  /** Call when the track finishes. */
  readonly onComplete: () => void;
}

/**
 * Tracks play milestones for one track within the PAC:
 * `pac_play_start` on first play, `pac_play_30s` at 30 seconds of
 * cumulative playback, and `pac_play_complete` when the track ends —
 * each fired at most once.
 */
export function createPacPlayMilestoneTracker(
  emit: (
    event: Extract<
      PacClientEventName,
      'pac_play_start' | 'pac_play_30s' | 'pac_play_complete'
    >,
    extras?: PacEventExtras
  ) => void,
  nowFn: () => number = () => Date.now()
): PacPlayMilestoneTracker {
  let startFired = false;
  let milestoneFired = false;
  let completeFired = false;
  let accumulatedMs = 0;
  let playingSince: number | null = null;

  const currentPlayedMs = () =>
    accumulatedMs + (playingSince === null ? 0 : nowFn() - playingSince);

  const checkMilestone = () => {
<<<<<<< HEAD
    if (milestoneFired || currentPlayedMs() < PLAY_MILESTONE_MS) return;
=======
    if (milestoneFired || currentPlayedMs() <= PLAY_MILESTONE_MS) return;
>>>>>>> origin/main
    milestoneFired = true;
    emit('pac_play_30s', { played_ms: currentPlayedMs() });
  };

  return {
    onPlay() {
      if (!startFired) {
        startFired = true;
        emit('pac_play_start');
      }
      if (playingSince === null) {
        playingSince = nowFn();
      }
      checkMilestone();
    },
    onPause() {
      if (playingSince !== null) {
        accumulatedMs += nowFn() - playingSince;
        playingSince = null;
      }
      checkMilestone();
    },
    onTick() {
      checkMilestone();
    },
    onComplete() {
      if (playingSince !== null) {
        accumulatedMs += nowFn() - playingSince;
        playingSince = null;
      }
      checkMilestone();
      if (!completeFired) {
        completeFired = true;
        emit('pac_play_complete', { played_ms: accumulatedMs });
      }
    },
  };
}

interface PacEventsTestBridge {
  readonly PAC_CLIENT_EVENTS: typeof PAC_CLIENT_EVENTS;
  readonly PAC_STATES: typeof PAC_STATES;
  readonly buildPacVariantId: typeof buildPacVariantId;
  readonly getPacSessionId: typeof getPacSessionId;
  readonly trackPacClientEvent: typeof trackPacClientEvent;
  readonly trackPacExposure: typeof trackPacExposure;
}

// E2E-only bridge so scripted Playwright passes (spec AC-12) can drive the
// real emitter. Never enabled in production builds — NEXT_PUBLIC_E2E_MODE is
// a CI/E2E-only flag.
if (globalThis.window !== undefined && publicEnv.NEXT_PUBLIC_E2E_MODE === '1') {
  (
    globalThis.window as Window & { __jovPacEvents?: PacEventsTestBridge }
  ).__jovPacEvents = {
    PAC_CLIENT_EVENTS,
    PAC_STATES,
    buildPacVariantId,
    getPacSessionId,
    trackPacClientEvent,
    trackPacExposure,
  };
}
