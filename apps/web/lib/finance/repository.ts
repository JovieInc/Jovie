import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type FinanceAccount,
  type FinanceInstitution,
  type FinanceTransaction,
  financeAccounts,
  financeInstitutions,
  financeTransactions,
} from '@/lib/db/schema/finance';
import { assertFinancialOwnerId } from './owner';

/**
 * Owner-scoped finance repository (JOV-4609).
 *
 * Every function takes `ownerUserId` (a `users.id` UUID from
 * `requireFinancialOwnerId` or a validated job payload) and filters on it.
 * RLS independently enforces the same predicate, so these queries are the
 * application layer of a deny-by-default boundary — there is intentionally
 * no way to query "for a creator" or "across owners".
 */

export async function listFinanceInstitutions(
  ownerUserId: string
): Promise<FinanceInstitution[]> {
  const owner = assertFinancialOwnerId(ownerUserId);
  return db
    .select()
    .from(financeInstitutions)
    .where(eq(financeInstitutions.ownerUserId, owner));
}

export async function listFinanceAccounts(
  ownerUserId: string
): Promise<FinanceAccount[]> {
  const owner = assertFinancialOwnerId(ownerUserId);
  return db
    .select()
    .from(financeAccounts)
    .where(eq(financeAccounts.ownerUserId, owner));
}

export async function getFinanceAccount(
  ownerUserId: string,
  accountId: string
): Promise<FinanceAccount | null> {
  const owner = assertFinancialOwnerId(ownerUserId);
  const [account] = await db
    .select()
    .from(financeAccounts)
    .where(
      and(
        eq(financeAccounts.id, accountId),
        eq(financeAccounts.ownerUserId, owner)
      )
    )
    .limit(1);
  return account ?? null;
}

export async function listFinanceTransactions(
  ownerUserId: string,
  options?: { accountId?: string; limit?: number }
): Promise<FinanceTransaction[]> {
  const owner = assertFinancialOwnerId(ownerUserId);
  const conditions = [eq(financeTransactions.ownerUserId, owner)];
  if (options?.accountId) {
    conditions.push(eq(financeTransactions.accountId, options.accountId));
  }
  return db
    .select()
    .from(financeTransactions)
    .where(and(...conditions))
    .orderBy(desc(financeTransactions.occurredAt))
    .limit(options?.limit ?? 100);
}
