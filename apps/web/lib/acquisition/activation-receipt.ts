import 'server-only';

import { isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { acquisitionJourneys } from '@/lib/db/schema/acquisition';
import { captureError } from '@/lib/error-tracking';
import {
  FIRST_TOUCH_COOKIE,
  openFirstTouchEnvelope,
} from './first-touch-envelope';
import { toReceiptFirstTouch } from './first-touch-receipt';

/**
 * Passive-attribution consent state. The envelope holds only allowlisted,
 * non-PII first-party fields (UTM params, referrer host, landing route), so
 * the receipt is recorded under the passive-attribution basis rather than
 * the `analytics_allowed` basis used by consent-gated creator pixels.
 */
const PASSIVE_CONSENT_STATE = 'passive_attribution';
const PASSIVE_IDENTITY_SCOPE = 'pre_auth_first_party_cookie';

/**
 * Attach the passive first-touch envelope to the durable activation
 * receipt — exactly once per app user, enforced by the
 * `acquisition_journeys_user_id_unique` index. An anonymous capture with the
 * same signed id can be linked, but another user cannot take it over.
 * Repeat activations (returning users, extra profiles, mobile + web) are
 * idempotent no-ops.
 *
 * Called from every path that sets `creator_profiles.onboarding_completed_at`.
 * Best-effort: failures are reported and swallowed so attribution never
 * regresses activation itself.
 *
 * @returns `true` when this call wrote the receipt.
 */
export async function attachFirstTouchReceipt(
  appUserId: string
): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const envelope = await openFirstTouchEnvelope(
      cookieStore.get(FIRST_TOUCH_COOKIE)?.value
    );

    const now = new Date();
    const rows = await db
      .insert(acquisitionJourneys)
      .values({
        id: envelope?.id ?? crypto.randomUUID(),
        userId: appUserId,
        firstTouch: toReceiptFirstTouch(envelope),
        consentState: PASSIVE_CONSENT_STATE,
        identityScope: PASSIVE_IDENTITY_SCOPE,
        capturedAt: envelope ? new Date(envelope.iat) : now,
        linkedAt: now,
      })
      .onConflictDoUpdate({
        target: acquisitionJourneys.id,
        set: {
          userId: appUserId,
          linkedAt: now,
          ...(envelope?.agentIntent
            ? { firstTouch: toReceiptFirstTouch(envelope) }
            : {}),
        },
        setWhere: isNull(acquisitionJourneys.userId),
      })
      .returning({ id: acquisitionJourneys.id });

    return rows.length > 0;
  } catch (error) {
    await captureError('Failed to attach first-touch receipt', error, {
      route: 'lib/acquisition/activation-receipt',
      contextData: { appUserId },
    });
    return false;
  }
}
