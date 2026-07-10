/**
 * PAC (Primary Action Card) instrumentation contract — spec §8.
 *
 * Shared, isomorphic definitions for the PAC event schema (issue #13063,
 * parent cluster #13060). This module is import-safe from both server code
 * (the `/api/profile/pac-event` sink, webhook back-join helpers) and client
 * code (the emitter in `pac-events.ts`). Keep it free of `server-only`,
 * `use client`, and Next.js runtime imports.
 *
 * Payload contract — every event carries:
 * - `jv_aid`   — anonymous audience id. `null` on the client (the cookie is
 *   httpOnly by design); the sink derives it server-side, and only when the
 *   visitor's consent state permits identity joining.
 * - `profile_id` — the artist/profile uuid the PAC belongs to.
 * - `pac_state`  — the PAC state machine state at emit time.
 * - `variant_id` — combined experiment arm key (copy arm + trigger threshold
 *   + S2 slot) built from the visitor's `ProfilePacAssignment`.
 * - `session_id` — per-tab session uuid (sessionStorage-scoped).
 *
 * Events extend the existing consent-aware tracking schema — no new tracking
 * surface, no new third-party analytics.
 */

import { z } from 'zod';
import type { ProfilePacAssignment } from '@/lib/flags/profile-pac';
import { uuidSchema } from '@/lib/validation/schemas/base';

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

/**
 * Server-emitted PAC events. `pac_s2_convert` is the webhook back-join for
 * merch/tip/ticket conversions — emitted by commerce webhook handlers via
 * `trackPacS2Convert`, never by the client.
 */
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

/**
 * Consent states under which the sink must NOT join the event to the
 * visitor's `jv_aid` identity. Events still count toward anonymous,
 * session-scoped aggregates (the experiment denominator).
 */
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

/**
 * Builds the combined variant key for the visitor's PAC assignment.
 * Keys every event to all experiment slots (S1 copy/trigger, S2, plus
 * component arms for tab-bar + dismiss) so any slot's arms can be compared
 * without re-deriving assignment server-side.
 */
export function buildPacVariantId(assignment: ProfilePacAssignment): string {
  const { copyArm, triggerThreshold, s2Slot, tabBar, dismissAffordance } =
    assignment;
  return `copy:${copyArm}|trigger:${triggerThreshold}|s2:${s2Slot}|tab:${tabBar}|dismiss:${dismissAffordance}`;
}

/**
 * Zod schema for client beacons arriving at the sink. `jv_aid` is accepted
 * but ignored — the sink is authoritative and derives it from the httpOnly
 * cookie (consent permitting).
 */
export const pacEventBeaconSchema = z.object({
  event: z.enum(PAC_CLIENT_EVENTS),
  jv_aid: z.string().uuid().nullable().optional(),
  profile_id: uuidSchema,
  pac_state: z.enum(PAC_STATES),
  variant_id: z.string().min(1).max(160),
  session_id: uuidSchema,
  consent: z.enum(PAC_CONSENT_STATES),
  ts: z.number().int().nonnegative(),
  extras: z
    .record(
      z.string().max(64),
      z.union([z.string().max(256), z.number(), z.boolean()])
    )
    .optional(),
});

export type PacEventBeacon = z.infer<typeof pacEventBeaconSchema>;
