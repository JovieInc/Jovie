import 'server-only';

import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type FinanceBudgetSettings,
  type FinanceBudgetTarget,
  type FinanceTransaction,
  financeBudgetSettings,
  financeBudgetTargets,
  financeTransactions,
} from '@/lib/db/schema/finance';
import {
  type FinanceBudgetCategory,
  isFinanceBudgetCategory,
  isValidBudgetScope,
} from './budgets';
import { assertFinancialOwnerId } from './owner';

/**
 * Owner-scoped budget repository (JOV-4620).
 *
 * Every function takes `ownerUserId` and filters on it; RLS enforces the
 * same predicate. There is no creator-, workspace-, or cross-owner path.
 */

export const BUDGET_REPOSITORY_ERRORS = {
  INVALID_CATEGORY: 'Invalid budget category',
  INVALID_MONTH: 'Invalid budget month scope',
  INVALID_AMOUNT: 'Invalid target amount',
} as const;

function assertCategory(category: unknown): FinanceBudgetCategory {
  if (!isFinanceBudgetCategory(category)) {
    throw new TypeError(BUDGET_REPOSITORY_ERRORS.INVALID_CATEGORY);
  }
  return category;
}

function assertScope(month: unknown): string {
  if (!isValidBudgetScope(month)) {
    throw new TypeError(BUDGET_REPOSITORY_ERRORS.INVALID_MONTH);
  }
  return month;
}

function assertAmount(amount: unknown): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
    throw new TypeError(BUDGET_REPOSITORY_ERRORS.INVALID_AMOUNT);
  }
  return String(n);
}

/** Inclusive [start, end) UTC bounds for a 'YYYY-MM' month string. */
export function budgetMonthBounds(month: string): {
  start: Date;
  end: Date;
} {
  const [y, m] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
  };
}

export async function listBudgetTargets(
  ownerUserId: string,
  month?: string
): Promise<FinanceBudgetTarget[]> {
  const owner = assertFinancialOwnerId(ownerUserId);
  const conditions = [eq(financeBudgetTargets.ownerUserId, owner)];
  if (month !== undefined) {
    // Fetch the baseline plus the month's overrides in one scoped query;
    // precedence is resolved in budgets.ts.
    conditions.push(
      inArray(financeBudgetTargets.month, [assertScope(month), 'baseline'])
    );
  }
  return db
    .select()
    .from(financeBudgetTargets)
    .where(and(...conditions));
}

export async function upsertBudgetTarget(
  ownerUserId: string,
  input: { category: string; month: string; amount: number | string }
): Promise<void> {
  const owner = assertFinancialOwnerId(ownerUserId);
  const category = assertCategory(input.category);
  const month = assertScope(input.month);
  const amount = assertAmount(input.amount);
  await db
    .insert(financeBudgetTargets)
    .values({
      ownerUserId: owner,
      category,
      month,
      targetAmount: amount,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        financeBudgetTargets.ownerUserId,
        financeBudgetTargets.category,
        financeBudgetTargets.month,
      ],
      set: { targetAmount: amount, updatedAt: new Date() },
    });
}

export async function deleteBudgetTarget(
  ownerUserId: string,
  input: { category: string; month: string }
): Promise<void> {
  const owner = assertFinancialOwnerId(ownerUserId);
  const category = assertCategory(input.category);
  const month = assertScope(input.month);
  await db
    .delete(financeBudgetTargets)
    .where(
      and(
        eq(financeBudgetTargets.ownerUserId, owner),
        eq(financeBudgetTargets.category, category),
        eq(financeBudgetTargets.month, month)
      )
    );
}

export async function getBudgetSettings(
  ownerUserId: string
): Promise<FinanceBudgetSettings | null> {
  const owner = assertFinancialOwnerId(ownerUserId);
  const [row] = await db
    .select()
    .from(financeBudgetSettings)
    .where(eq(financeBudgetSettings.ownerUserId, owner))
    .limit(1);
  return row ?? null;
}

export async function upsertBudgetSettings(
  ownerUserId: string,
  input: { includedAccountIds: string[] | null }
): Promise<void> {
  const owner = assertFinancialOwnerId(ownerUserId);
  const ids = input.includedAccountIds?.filter(id =>
    /^[0-9a-f-]{36}$/i.test(id)
  );
  await db
    .insert(financeBudgetSettings)
    .values({
      ownerUserId: owner,
      includedAccountIds: ids ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: financeBudgetSettings.ownerUserId,
      set: { includedAccountIds: ids ?? null, updatedAt: new Date() },
    });
}

/** Ledger rows for one UTC month, owner-scoped, non-pending only. */
export async function listBudgetMonthTransactions(
  ownerUserId: string,
  month: string
): Promise<FinanceTransaction[]> {
  const owner = assertFinancialOwnerId(ownerUserId);
  const { start, end } = budgetMonthBounds(month);
  return db
    .select()
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.ownerUserId, owner),
        eq(financeTransactions.pending, 'false'),
        gte(financeTransactions.occurredAt, start),
        lt(financeTransactions.occurredAt, end)
      )
    );
}
