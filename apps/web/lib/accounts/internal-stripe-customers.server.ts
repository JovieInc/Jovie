import 'server-only';

import { and, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { internalAccountSql } from './internal-account';

/**
 * Stripe customer ids that belong to internal/test users, found through the
 * user row (email rules + account_class) so a customer whose Stripe email
 * differs from the account email is still excluded from revenue.
 */
export async function getInternalStripeCustomerIds(): Promise<Set<string>> {
  const rows = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(and(isNotNull(users.stripeCustomerId), internalAccountSql()));
  return new Set(
    rows
      .map(row => row.stripeCustomerId)
      .filter((id): id is string => id !== null)
  );
}
