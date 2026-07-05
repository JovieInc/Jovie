/**
 * `pac_s2_convert` — server-side webhook back-join for PAC S2 conversions
 * (spec §8, issue #13063).
 *
 * When a merch / tip / ticket purchase confirms (e.g. via a Stripe webhook),
 * the commerce handler calls `trackPacS2Convert` with the PAC context that
 * was threaded through checkout metadata (`session_id`, `variant_id`,
 * `profile_id`, optional `jv_aid`). This joins the revenue reward back to
 * the exposure/variant that produced it — the reward signal the S2 slot
 * auto-promotion loop needs.
 *
 * Fail-safe by contract: never throws — a tracking failure must never break
 * a webhook handler.
 */

import { trackEvent } from '@/lib/analytics/runtime-aware';
import type { ProfilePacS2Slot } from '@/lib/flags/profile-pac';
import { logStatsigEvent } from '@/lib/flags/statsig';
import type { PacEventPayload } from '@/lib/tracking/pac-events-contract';
import { logger } from '@/lib/utils/logger';

export interface PacS2ConvertInput {
  /** The artist/profile uuid the PAC belongs to. */
  readonly profileId: string;
  /** PAC session id threaded through checkout metadata. */
  readonly sessionId: string;
  /** Combined variant key threaded through checkout metadata. */
  readonly variantId: string;
  /** jv_aid captured at checkout time, when consent permitted joining. */
  readonly jvAid?: string | null;
  /** Which S2 slot converted. */
  readonly slot: ProfilePacS2Slot;
  /** Realized revenue for the conversion, in cents. */
  readonly revenueCents?: number;
  /** Originating webhook/source, e.g. 'stripe_webhook'. */
  readonly source?: string;
}

/**
 * Emits the `pac_s2_convert` event to Statsig (variant-keyed reward metric)
 * and the server-side analytics path.
 */
export async function trackPacS2Convert(
  input: PacS2ConvertInput
): Promise<void> {
  try {
    const jvAid = input.jvAid ?? null;
    const payload: PacEventPayload = {
      event: 'pac_s2_convert',
      jv_aid: jvAid,
      profile_id: input.profileId,
      pac_state: input.slot,
      variant_id: input.variantId,
      session_id: input.sessionId,
      consent: jvAid ? 'accepted' : 'undecided',
      ts: Date.now(),
      extras: {
        slot: input.slot,
        ...(input.revenueCents === undefined
          ? {}
          : { revenue_cents: input.revenueCents }),
        source: input.source ?? 'webhook',
      },
    };

    const statsigUserId = jvAid ?? `pac-session:${input.sessionId}`;
    await logStatsigEvent(
      statsigUserId,
      payload.event,
      input.revenueCents ?? payload.variant_id,
      {
        profile_id: payload.profile_id,
        pac_state: payload.pac_state,
        variant_id: payload.variant_id,
        session_id: payload.session_id,
        slot: input.slot,
        ...(input.revenueCents === undefined
          ? {}
          : { revenue_cents: String(input.revenueCents) }),
        source: input.source ?? 'webhook',
      }
    );
    void trackEvent(payload.event, { ...payload });

    logger.info('[pac-event] s2 convert', payload);
  } catch (error) {
    // Never let conversion tracking break a webhook handler.
    logger.error('[pac-event] s2 convert failed', error);
  }
}
