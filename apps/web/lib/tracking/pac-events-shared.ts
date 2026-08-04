/**
 * PAC (Primary Action Card) event definitions shared by browser emitters and
 * server sinks. Keep this module dependency-light: it is part of the public
 * profile client graph. Runtime validation belongs in `pac-events-contract`.
 */

import type { ProfilePacAssignment } from '@/lib/flags/profile-pac';

/** First-party sink endpoint for PAC beacon events. */
export const PAC_EVENT_ENDPOINT = '/api/profile/pac-event';

/** Client-emitted PAC events (fired from the profile surface). */
export const PAC_CLIENT_EVENTS = [
  /** PAC ≥50% visible — once per state per session. */
  'pac_exposure',
  /** Visitor initiated playback. */
  'pac_play_start',
  /** 30 seconds of cumulative playback. */
  'pac_play_30s',
  /** Track completed. */
  'pac_play_complete',
  /** Email/SMS capture prompt appeared. */
  'capture_prompt_shown',
  /** Capture form submitted. */
  'capture_submit',
  /** Capture succeeded. */
  'capture_success',
  /** Capture failed — carries the failing rule in `extras.rule`. */
  'capture_error',
  /** Visitor dismissed the capture prompt. */
  'capture_dismiss',
  /** Email ↔ SMS channel toggle — carries `extras.channel`. */
  'capture_channel_toggle',
  /** Secondary (S2 slot) action clicked — carries `extras.slot`. */
  'pac_secondary_click',
] as const;

export type PacClientEventName = (typeof PAC_CLIENT_EVENTS)[number];

/** Server-emitted PAC events, never accepted from the browser sink. */
export const PAC_SERVER_EVENTS = ['pac_s2_convert'] as const;

export type PacServerEventName = (typeof PAC_SERVER_EVENTS)[number];
export type PacEventName = PacClientEventName | PacServerEventName;

/** PAC state machine states (spec §8 payload contract). */
export const PAC_STATES = [
  'idle',
  'playing',
  'prompt',
  'submitting',
  'error',
  'success',
  'dismissed',
  'merch',
  'tip',
  'tickets',
  'rsvp',
  'following',
] as const;

export type PacState = (typeof PAC_STATES)[number];

/** Consent states mirrored from `@/lib/tracking/consent` (kept in sync). */
export const PAC_CONSENT_STATES = [
  'undecided',
  'accepted',
  'rejected',
  'gpc-opted-out',
] as const;

export type PacConsentState = (typeof PAC_CONSENT_STATES)[number];

/** Consent states where the sink must not join events to `jv_aid`. */
export const PAC_IDENTITY_BLOCKED_CONSENTS: readonly PacConsentState[] = [
  'rejected',
  'gpc-opted-out',
];

/** Structured extras attached per-event (e.g. `rule`, `channel`, `slot`). */
export type PacEventExtras = Readonly<
  Record<string, string | number | boolean>
>;

/** Canonical payload shape for every PAC event. */
export interface PacEventPayload {
  readonly event: PacEventName;
  readonly jv_aid: string | null;
  readonly profile_id: string;
  readonly pac_state: PacState;
  readonly variant_id: string;
  readonly session_id: string;
  readonly consent: PacConsentState;
  readonly ts: number;
  readonly extras?: PacEventExtras;
}

/** Builds the combined variant key for the visitor's PAC assignment. */
export function buildPacVariantId(assignment: ProfilePacAssignment): string {
  const { copyArm, triggerThreshold, s2Slot, tabBar, dismissAffordance } =
    assignment;
  return `copy:${copyArm}|trigger:${triggerThreshold}|s2:${s2Slot}|tab:${tabBar}|dismiss:${dismissAffordance}`;
}
