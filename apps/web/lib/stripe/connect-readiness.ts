import 'server-only';

import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureWarning } from '@/lib/error-tracking';
import { stripe } from '@/lib/stripe/client';

/**
 * Cache TTL for Stripe Connect readiness reads. Webhooks (`account.updated`,
 * `account.application.deauthorized`) are the source of truth for keeping
 * this cache fresh; the TTL only protects against silent webhook delivery
 * loss.
 */
export const STRIPE_CONNECT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

export interface StripeConnectReadiness {
  readonly stripeAccountId: string;
  readonly chargesEnabled: boolean;
  readonly payoutsEnabled: boolean;
  readonly detailsSubmitted: boolean;
  /** Alias for `detailsSubmitted`; kept for back-compat with existing callers. */
  readonly onboardingComplete: boolean;
  readonly payoutEmail: string | null;
  readonly lastSyncedAt: Date | null;
  readonly source: 'cache' | 'stripe' | 'cache-stale-stripe-failed';
}

interface CachedRow {
  readonly id: string;
  readonly stripeAccountId: string;
  // DB columns are NOT NULL with default false at the schema level, but
  // model them as nullable here so any historical/legacy row with a NULL
  // boolean is normalized to false rather than leaking through the helper.
  readonly stripeChargesEnabled: boolean | null;
  readonly stripePayoutsEnabled: boolean | null;
  readonly stripeDetailsSubmitted: boolean | null;
  readonly stripeOnboardingComplete: boolean | null;
  readonly stripePayoutEmail: string | null;
  readonly stripeConnectLastSyncedAt: Date | null;
}

function isFresh(syncedAt: Date | null, ttlMs: number): boolean {
  if (!syncedAt) return false;
  return Date.now() - syncedAt.getTime() < ttlMs;
}

function rowToReadiness(
  row: CachedRow,
  source: StripeConnectReadiness['source']
): StripeConnectReadiness {
  return {
    stripeAccountId: row.stripeAccountId,
    chargesEnabled: row.stripeChargesEnabled === true,
    payoutsEnabled: row.stripePayoutsEnabled === true,
    detailsSubmitted: row.stripeDetailsSubmitted === true,
    onboardingComplete: row.stripeOnboardingComplete === true,
    payoutEmail: row.stripePayoutEmail,
    lastSyncedAt: row.stripeConnectLastSyncedAt,
    source,
  };
}

/**
 * Read Stripe Connect readiness from the DB cache. Falls back to Stripe and
 * writes through when the cache is empty or older than `ttlMs`.
 *
 * Returns `null` if no creator profile is mapped to the given Connect account.
 *
 * On Stripe failure with a stale cache, returns the stale row tagged
 * `cache-stale-stripe-failed` and emits `captureWarning`. Tips/checkout paths
 * can decide whether stale flags are acceptable.
 */
export async function getStripeConnectReadiness(
  stripeAccountId: string,
  options: { readonly ttlMs?: number; readonly forceRefresh?: boolean } = {}
): Promise<StripeConnectReadiness | null> {
  const ttlMs = options.ttlMs ?? STRIPE_CONNECT_CACHE_TTL_MS;

  const [row] = await db
    .select({
      id: creatorProfiles.id,
      stripeAccountId: creatorProfiles.stripeAccountId,
      stripeChargesEnabled: creatorProfiles.stripeChargesEnabled,
      stripePayoutsEnabled: creatorProfiles.stripePayoutsEnabled,
      stripeDetailsSubmitted: creatorProfiles.stripeDetailsSubmitted,
      stripeOnboardingComplete: creatorProfiles.stripeOnboardingComplete,
      stripePayoutEmail: creatorProfiles.stripePayoutEmail,
      stripeConnectLastSyncedAt: creatorProfiles.stripeConnectLastSyncedAt,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.stripeAccountId, stripeAccountId))
    .limit(1);

  if (!row?.stripeAccountId) return null;

  const cached = row as CachedRow;

  if (
    !options.forceRefresh &&
    isFresh(cached.stripeConnectLastSyncedAt, ttlMs)
  ) {
    return rowToReadiness(cached, 'cache');
  }

  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieve(stripeAccountId);
  } catch (err) {
    await captureWarning('Stripe Connect readiness fetch failed', err, {
      stripeAccountId,
    });
    return rowToReadiness(cached, 'cache-stale-stripe-failed');
  }

  const charges = account.charges_enabled === true;
  const payouts = account.payouts_enabled === true;
  const details = account.details_submitted === true;
  const email = typeof account.email === 'string' ? account.email : null;
  const now = new Date();

  await db
    .update(creatorProfiles)
    .set({
      stripeChargesEnabled: charges,
      stripePayoutsEnabled: payouts,
      stripeDetailsSubmitted: details,
      stripeOnboardingComplete: details,
      stripePayoutEmail: email,
      stripeConnectLastSyncedAt: now,
      updatedAt: now,
    })
    .where(eq(creatorProfiles.id, cached.id));

  return {
    stripeAccountId,
    chargesEnabled: charges,
    payoutsEnabled: payouts,
    detailsSubmitted: details,
    onboardingComplete: details,
    payoutEmail: email,
    lastSyncedAt: now,
    source: 'stripe',
  };
}
