/**
 * PAC (Primary Action Card) server validation contract — spec §8.
 *
 * Zod-backed validation for the `/api/profile/pac-event` sink. Browser-safe
 * constants, types, and the variant builder live in `pac-events-shared` so
 * the public profile does not ship the server validation dependency.
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
import {
  PAC_CLIENT_EVENTS,
  PAC_CONSENT_STATES,
  PAC_STATES,
} from '@/lib/tracking/pac-events-shared';
import { uuidSchema } from '@/lib/validation/schemas/base';

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
