import type { ProfilePacS2Slot } from '@/lib/flags/profile-pac';

/**
 * Primary Action Card (PAC) visitor state machine.
 *
 * The PAC renders exactly one of twelve states, grouped by visitor tier:
 *
 *   S0 (cold)     — idle | playing
 *   S1 (warmed)   — prompt | submitting | error | success | dismissed
 *   S2 (captured) — merch | tip | tickets | rsvp | following
 *
 * Pure module — no React, no DOM. The component layer maps a
 * {@link PacState} onto the 4-zone card anatomy; this module owns
 * resolution (which state a visitor lands in) and transitions.
 *
 * Spec: JOV issue #13061 / parent #13060 (spec locked 2026-07-03).
 */

export type PacS0Kind = 'idle' | 'playing';
export type PacS1Kind =
  | 'prompt'
  | 'submitting'
  | 'error'
  | 'success'
  | 'dismissed';
export type PacS2Kind = 'merch' | 'tip' | 'tickets' | 'rsvp' | 'following';
export type PacStateKind = PacS0Kind | PacS1Kind | PacS2Kind;

export type PacStage = 's0' | 's1' | 's2';

export type PacVisitorTier = 'cold' | 'warmed' | 'captured';

/** What the profile actually has available to offer, per state family. */
export interface PacInventory {
  /** A playable audio preview exists for the featured release. */
  readonly hasPreview: boolean;
  /** At least one live merch card. */
  readonly hasMerch: boolean;
  /** Tipping is enabled on this profile. */
  readonly hasTip: boolean;
  /** An upcoming show with a ticket link. */
  readonly hasTicketedShow: boolean;
  /** An upcoming show (with or without tickets). */
  readonly hasUpcomingShow: boolean;
}

export interface PacContext {
  readonly tier: PacVisitorTier;
  /** Experiment-assigned S2 slot (merch | tip | tickets | rsvp). */
  readonly s2Slot: ProfilePacS2Slot;
  /**
   * Capture prompt suppressed for this visitor (recent dismissal per the
   * 7-day / session-cap rule enforced by /api/profile/capture-dismissal).
   */
  readonly captureSuppressed: boolean;
  readonly inventory: PacInventory;
}

export interface PacState {
  readonly kind: PacStateKind;
  readonly stage: PacStage;
  /**
   * True when the preferred presentation for this state was unavailable and
   * the card fell down the degraded ladder (e.g. no audio preview → S0 idle
   * renders a link-out instead of inline play; assigned S2 slot empty →
   * next available slot; nothing available → following).
   */
  readonly degraded: boolean;
}

export type PacEvent =
  | { readonly type: 'PLAY' }
  | { readonly type: 'PAUSE' }
  /** Listen threshold reached (30s or track-complete per assignment). */
  | { readonly type: 'LISTEN_THRESHOLD' }
  | { readonly type: 'CAPTURE_SUBMIT' }
  | { readonly type: 'CAPTURE_SUCCESS' }
  | { readonly type: 'CAPTURE_FAILURE' }
  | { readonly type: 'RETRY' }
  | { readonly type: 'DISMISS' }
  /** Visitor context re-resolved (jv_aid landed, subscription changed). */
  | { readonly type: 'RESOLVE' };

export function stageOf(kind: PacStateKind): PacStage {
  switch (kind) {
    case 'idle':
    case 'playing':
      return 's0';
    case 'prompt':
    case 'submitting':
    case 'error':
    case 'success':
    case 'dismissed':
      return 's1';
    default:
      return 's2';
  }
}

function slotAvailable(slot: PacS2Kind, inventory: PacInventory): boolean {
  switch (slot) {
    case 'merch':
      return inventory.hasMerch;
    case 'tip':
      return inventory.hasTip;
    case 'tickets':
      return inventory.hasTicketedShow;
    case 'rsvp':
      return inventory.hasUpcomingShow;
    case 'following':
      return true;
  }
}

/** Degraded ladder for the captured (S2) stage: assigned slot first, then
 * each monetization slot in priority order, finally `following` which is
 * always renderable. */
const S2_LADDER: readonly PacS2Kind[] = [
  'merch',
  'tip',
  'tickets',
  'rsvp',
  'following',
];

export function resolveS2State(ctx: PacContext): PacState {
  if (slotAvailable(ctx.s2Slot, ctx.inventory)) {
    return { kind: ctx.s2Slot, stage: 's2', degraded: false };
  }

  for (const slot of S2_LADDER) {
    if (slot === ctx.s2Slot) continue;
    if (slotAvailable(slot, ctx.inventory)) {
      return { kind: slot, stage: 's2', degraded: true };
    }
  }

  return { kind: 'following', stage: 's2', degraded: true };
}

/**
 * Resolve the state a visitor lands in when the card (re)mounts.
 *
 * The server always resolves `cold` (no jv_aid during ISR) which yields the
 * S0 idle default — that is the JS-off-safe render. The client re-resolves
 * once the anon cookie bootstrap lands.
 */
export function resolveInitialPacState(ctx: PacContext): PacState {
  if (ctx.tier === 'captured') {
    return resolveS2State(ctx);
  }

  if (ctx.tier === 'warmed') {
    if (ctx.captureSuppressed) {
      return { kind: 'dismissed', stage: 's1', degraded: true };
    }
    return { kind: 'prompt', stage: 's1', degraded: false };
  }

  return {
    kind: 'idle',
    stage: 's0',
    degraded: !ctx.inventory.hasPreview,
  };
}

/**
 * Pure transition function. Unknown event/state combinations return the
 * current state unchanged — the card never throws mid-render.
 */
export function pacReducer(
  state: PacState,
  event: PacEvent,
  ctx: PacContext
): PacState {
  switch (event.type) {
    case 'RESOLVE':
      // Context changed under us (jv_aid resolved, subscribe completed
      // elsewhere on the page). Never interrupt an in-flight submission,
      // an active S1 conversation, or inline playback.
      if (
        state.kind === 'submitting' ||
        state.kind === 'prompt' ||
        state.kind === 'error' ||
        state.kind === 'playing'
      ) {
        return state;
      }
      return resolveInitialPacState(ctx);

    case 'PLAY':
      if (state.kind === 'idle' && ctx.inventory.hasPreview) {
        return { kind: 'playing', stage: 's0', degraded: false };
      }
      return state;

    case 'PAUSE':
      if (state.kind === 'playing') {
        return { kind: 'idle', stage: 's0', degraded: false };
      }
      return state;

    case 'LISTEN_THRESHOLD':
      // The capture moment: post-listen, cold/warmed visitors get the
      // prompt exactly once (single-interruption rule). Captured visitors
      // and suppressed visitors never see it.
      if (state.kind !== 'playing' && state.kind !== 'idle') {
        return state;
      }
      if (ctx.tier === 'captured') {
        return state;
      }
      if (ctx.captureSuppressed) {
        return state;
      }
      return { kind: 'prompt', stage: 's1', degraded: false };

    case 'CAPTURE_SUBMIT':
      if (state.kind === 'prompt' || state.kind === 'error') {
        return { kind: 'submitting', stage: 's1', degraded: false };
      }
      return state;

    case 'CAPTURE_SUCCESS':
      if (state.kind === 'submitting') {
        return { kind: 'success', stage: 's1', degraded: false };
      }
      return state;

    case 'CAPTURE_FAILURE':
      if (state.kind === 'submitting') {
        return { kind: 'error', stage: 's1', degraded: false };
      }
      return state;

    case 'RETRY':
      if (state.kind === 'error') {
        return { kind: 'prompt', stage: 's1', degraded: false };
      }
      return state;

    case 'DISMISS':
      if (
        state.kind === 'prompt' ||
        state.kind === 'error' ||
        state.kind === 'success'
      ) {
        return { kind: 'dismissed', stage: 's1', degraded: false };
      }
      return state;

    default:
      return state;
  }
}

/**
 * Listen-threshold predicate shared by the component layer.
 * `30s` arm: 30 seconds listened (or full track when shorter).
 * `track_complete` arm: within half a second of the end.
 */
export function hasReachedListenThreshold(
  threshold: '30s' | 'track_complete',
  currentTime: number,
  duration: number
): boolean {
  if (duration <= 0) return false;
  if (threshold === 'track_complete') {
    return currentTime >= duration - 0.5;
  }
  return currentTime >= Math.min(30, duration - 0.5);
}
