import 'server-only';

import { and, desc, eq, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { DbOrTransaction } from '@/lib/db/client/types';
import {
  type FinanceAccount,
  type FinanceClassificationRule,
  type FinanceInstitution,
  type FinanceTransaction,
  type FinanceTransactionClassification,
  type FinanceTransactionSplit,
  financeAccounts,
  financeClassificationRules,
  financeInstitutions,
  financeTransactionClassifications,
  financeTransactionSplits,
  financeTransactions,
  type NewFinanceClassificationRule,
  type NewFinanceTransactionSplit,
} from '@/lib/db/schema/finance';
import {
  type ClassificationResult,
  type SplitLine,
  validateSplitTotals,
} from './classification';
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
  ownerUserId: string,
  client: DbOrTransaction = db
): Promise<FinanceInstitution[]> {
  const owner = assertFinancialOwnerId(ownerUserId);
  return client
    .select()
    .from(financeInstitutions)
    .where(eq(financeInstitutions.ownerUserId, owner));
}

export async function listFinanceAccounts(
  ownerUserId: string,
  client: DbOrTransaction = db
): Promise<FinanceAccount[]> {
  const owner = assertFinancialOwnerId(ownerUserId);
  return client
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
  options?: { accountId?: string; limit?: number },
  client: DbOrTransaction = db
): Promise<FinanceTransaction[]> {
  const owner = assertFinancialOwnerId(ownerUserId);
  const conditions = [eq(financeTransactions.ownerUserId, owner)];
  if (options?.accountId) {
    conditions.push(eq(financeTransactions.accountId, options.accountId));
  }
  return client
    .select()
    .from(financeTransactions)
    .where(and(...conditions))
    .orderBy(desc(financeTransactions.occurredAt))
    .limit(options?.limit ?? 100);
}

// ---------------------------------------------------------------------------
// Classification (JOV-4615)
// ---------------------------------------------------------------------------

export async function listClassificationRules(
  ownerUserId: string
): Promise<FinanceClassificationRule[]> {
  const owner = assertFinancialOwnerId(ownerUserId);
  return db
    .select()
    .from(financeClassificationRules)
    .where(eq(financeClassificationRules.ownerUserId, owner));
}

export async function createClassificationRule(
  ownerUserId: string,
  rule: Omit<NewFinanceClassificationRule, 'ownerUserId'>
): Promise<FinanceClassificationRule> {
  const owner = assertFinancialOwnerId(ownerUserId);
  const [row] = await db
    .insert(financeClassificationRules)
    .values({ ...rule, ownerUserId: owner })
    .returning();
  return row;
}

/**
 * Update an owner rule — corrections are reversible because rules are plain
 * rows (edit fields, set status='disabled', or delete). Reprocessing picks up
 * the change deterministically on the next run.
 */
export async function updateClassificationRule(
  ownerUserId: string,
  ruleId: string,
  patch: Partial<
    Pick<
      FinanceClassificationRule,
      | 'name'
      | 'status'
      | 'priority'
      | 'matchMerchantPattern'
      | 'matchDirection'
      | 'matchAmountMin'
      | 'matchAmountMax'
      | 'matchDescriptionTokens'
      | 'matchRecurrence'
      | 'setLens'
      | 'setCategory'
    >
  >
): Promise<FinanceClassificationRule | null> {
  const owner = assertFinancialOwnerId(ownerUserId);
  const [row] = await db
    .update(financeClassificationRules)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(financeClassificationRules.id, ruleId),
        eq(financeClassificationRules.ownerUserId, owner)
      )
    )
    .returning();
  return row ?? null;
}

/**
 * Persist a classification for a transaction. Upserts on `transaction_id` so
 * reprocessing is idempotent — re-running produces the same single row.
 */
export async function upsertTransactionClassification(
  ownerUserId: string,
  transactionId: string,
  result: ClassificationResult
): Promise<FinanceTransactionClassification> {
  const owner = assertFinancialOwnerId(ownerUserId);
  const [row] = await db
    .insert(financeTransactionClassifications)
    .values({
      ownerUserId: owner,
      transactionId,
      lens: result.lens,
      category: result.category,
      confidence: String(result.confidence),
      explanation: result.explanation,
      source: result.source,
      ruleId: result.ruleId,
    })
    .onConflictDoUpdate({
      target: financeTransactionClassifications.transactionId,
      set: {
        lens: result.lens,
        category: result.category,
        confidence: String(result.confidence),
        explanation: result.explanation,
        source: result.source,
        ruleId: result.ruleId,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function getTransactionClassification(
  ownerUserId: string,
  transactionId: string
): Promise<FinanceTransactionClassification | null> {
  const owner = assertFinancialOwnerId(ownerUserId);
  const [row] = await db
    .select()
    .from(financeTransactionClassifications)
    .where(
      and(
        eq(financeTransactionClassifications.transactionId, transactionId),
        eq(financeTransactionClassifications.ownerUserId, owner)
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * Replace a transaction's splits. Split amounts must sum exactly to the
 * parent amount — `validateSplitTotals` throws before any write, so a bad
 * split can never partially persist.
 */
export async function setTransactionSplits(
  ownerUserId: string,
  transactionId: string,
  parentAmount: number,
  splits: SplitLine[]
): Promise<FinanceTransactionSplit[]> {
  const owner = assertFinancialOwnerId(ownerUserId);
  validateSplitTotals(parentAmount, splits);

  await db
    .delete(financeTransactionSplits)
    .where(
      and(
        eq(financeTransactionSplits.transactionId, transactionId),
        eq(financeTransactionSplits.ownerUserId, owner)
      )
    );

  const rows: NewFinanceTransactionSplit[] = splits.map((split, i) => ({
    ownerUserId: owner,
    transactionId,
    seq: i,
    amount: String(split.amount),
    lens: split.lens,
    category: split.category ?? null,
    note: split.note ?? null,
  }));
  return db.insert(financeTransactionSplits).values(rows).returning();
}

export async function listTransactionSplits(
  ownerUserId: string,
  transactionId: string
): Promise<FinanceTransactionSplit[]> {
  const owner = assertFinancialOwnerId(ownerUserId);
  return db
    .select()
    .from(financeTransactionSplits)
    .where(
      and(
        eq(financeTransactionSplits.transactionId, transactionId),
        eq(financeTransactionSplits.ownerUserId, owner)
      )
    );
}

/**
 * Concise review queue: transactions whose stored classification is
 * uncategorized or below the confidence threshold. Surfaces items for the
 * owner without blocking the rest of the dashboard.
 */
export async function listClassificationReviewQueue(
  ownerUserId: string,
  options?: { confidenceThreshold?: number; limit?: number }
): Promise<
  Array<{
    classification: FinanceTransactionClassification;
    transaction: FinanceTransaction;
  }>
> {
  const owner = assertFinancialOwnerId(ownerUserId);
  const threshold = String(options?.confidenceThreshold ?? 0.6);
  return db
    .select({
      classification: financeTransactionClassifications,
      transaction: financeTransactions,
    })
    .from(financeTransactionClassifications)
    .innerJoin(
      financeTransactions,
      eq(
        financeTransactionClassifications.transactionId,
        financeTransactions.id
      )
    )
    .where(
      and(
        eq(financeTransactionClassifications.ownerUserId, owner),
        or(
          eq(financeTransactionClassifications.lens, 'uncategorized'),
          lt(financeTransactionClassifications.confidence, threshold)
        )
      )
    )
    .orderBy(desc(financeTransactions.occurredAt))
    .limit(options?.limit ?? 50);
}
