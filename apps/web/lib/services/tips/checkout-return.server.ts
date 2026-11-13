import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getClientIP, tipCheckoutLimiter } from '@/lib/rate-limit';
import { stripe } from '@/lib/stripe/client';
import { withStripeRetry } from '@/lib/stripe/retry';

export type TipCheckoutReturnState =
  | 'confirmed'
  | 'pending'
  | 'incomplete'
  | 'unverified'
  | 'unavailable';

/** Read-only confirmation. A return URL is not a payment receipt. */
export async function resolveTipCheckoutReturn(
  username: string,
  sessionId: string | string[] | undefined,
  requestHeaders: Headers
): Promise<TipCheckoutReturnState> {
  if (
    typeof sessionId !== 'string' ||
    !/^cs_(test_|live_)?[a-zA-Z0-9]{1,200}$/.test(sessionId)
  ) {
    return 'unverified';
  }

  try {
    // Reuse the durable tip budget, with a separate return bucket so
    // refreshing a receipt cannot consume the fan's checkout-creation budget.
    const ip = getClientIP(
      new Request('https://jov.ie', { headers: requestHeaders })
    );
    const limit = await tipCheckoutLimiter.limit(`return:${ip}`);
    if (!limit.success) return 'unavailable';

    const [profile] = await db
      .select({ id: creatorProfiles.id, isPublic: creatorProfiles.isPublic })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, username.toLowerCase()))
      .limit(1);
    if (!profile?.isPublic) return 'unverified';

    const session = await withStripeRetry(
      'retrieveTipCheckoutReturn',
      () =>
        stripe.checkout.sessions.retrieve(
          sessionId,
          {},
          {
            timeout: 5000,
            maxNetworkRetries: 0,
          }
        ),
      { maxRetries: 1 }
    );
    if (
      session.mode !== 'payment' ||
      session.metadata?.source !== 'tip_checkout' ||
      session.metadata.profile_id !== profile.id ||
      session.metadata.handle?.toLowerCase() !== username.toLowerCase()
    ) {
      return 'unverified';
    }
    if (session.status === 'complete' && session.payment_status === 'paid') {
      return 'confirmed';
    }
    if (session.status === 'complete' && session.payment_status === 'unpaid') {
      return 'pending';
    }
    return 'incomplete';
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'resource_missing'
    ) {
      return 'unverified';
    }
    // Do not log the session, payer data, or provider exception (which may
    // contain them). A provider/DB failure must never become a paid receipt.
    return 'unavailable';
  }
}
