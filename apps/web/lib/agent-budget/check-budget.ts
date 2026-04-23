import { and, sql as drizzleSql, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userCreditGrants, userMonthlyUsage } from '@/lib/db/schema/agent-runs';
import { users } from '@/lib/db/schema/auth';
import {
  type AiBudgetPeriod,
  getAiBudgetCents,
  getAiBudgetPeriod,
} from '@/lib/entitlements/registry';

/**
 * Race-safe agent budget enforcement.
 *
 * Money-of-record for spend caps is the `user_monthly_usage` table.
 * Plan budget comes from the entitlement registry; additive credit
 * grants come from `user_credit_grants`.
 *
 * A reservation is a conditional atomic UPDATE: the row is only bumped
 * if the new reservation would still fit inside the cap. Concurrent
 * callers serialize on the row; the one that would blow the cap gets
 * zero rows back and is denied.
 */

export type BudgetDenyReason =
  | 'no_agent_access' // Free / trial-not-entitled
  | 'over_cap'
  | 'no_user';

export type BudgetCheckResult =
  | { ok: true; reservedCents: number; capCents: number; yearMonth: string }
  | { ok: false; reason: BudgetDenyReason; capCents: number };

function currentYearMonth(period: AiBudgetPeriod): string {
  if (period === 'trial_lifetime') return '0000-00';
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

async function getUserPlan(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.plan ?? null;
}

async function sumActiveGrantCents(userId: string): Promise<number> {
  const [row] = await db
    .select({
      total: drizzleSql<number>`COALESCE(SUM(${userCreditGrants.cents} - ${userCreditGrants.consumedCents}), 0)`,
    })
    .from(userCreditGrants)
    .where(
      and(
        eq(userCreditGrants.userId, userId),
        or(
          isNull(userCreditGrants.expiresAt),
          gt(userCreditGrants.expiresAt, new Date())
        )
      )
    );
  return Number(row?.total ?? 0);
}

/**
 * Atomically reserve `estimatedCents` against a user's cap.
 * Returns `{ ok: true }` if reserved, `{ ok: false, reason }` otherwise.
 *
 * Idempotency note: a single parent run should call `reserveBudget` once
 * at start. Per-step reservations should be a sub-reserve that fits
 * inside the parent's reservation; see `reserveStep`.
 */
export async function reserveBudget(
  userId: string,
  estimatedCents: number
): Promise<BudgetCheckResult> {
  if (estimatedCents < 0) throw new Error('estimatedCents must be >= 0');

  const plan = await getUserPlan(userId);
  if (!plan) return { ok: false, reason: 'no_user', capCents: 0 };

  const period = getAiBudgetPeriod(plan);
  if (period === 'none') {
    return { ok: false, reason: 'no_agent_access', capCents: 0 };
  }

  const planCap = getAiBudgetCents(plan);
  const grants = await sumActiveGrantCents(userId);
  const cap = planCap + grants;

  const yearMonth = currentYearMonth(period);

  // Ensure the row exists; do nothing on conflict.
  await db
    .insert(userMonthlyUsage)
    .values({ userId, yearMonth })
    .onConflictDoNothing({
      target: [userMonthlyUsage.userId, userMonthlyUsage.yearMonth],
    });

  // Atomic reservation: only bump if (reserved + spent + est) <= cap.
  const [updated] = await db
    .update(userMonthlyUsage)
    .set({
      reservedCents: drizzleSql`${userMonthlyUsage.reservedCents} + ${estimatedCents}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userMonthlyUsage.userId, userId),
        eq(userMonthlyUsage.yearMonth, yearMonth),
        drizzleSql`${userMonthlyUsage.reservedCents} + ${userMonthlyUsage.spentCents} + ${estimatedCents} <= ${cap}`
      )
    )
    .returning();

  if (!updated) {
    return { ok: false, reason: 'over_cap', capCents: cap };
  }

  return {
    ok: true,
    reservedCents: updated.reservedCents,
    capCents: cap,
    yearMonth,
  };
}

/**
 * Commit a prior reservation with the actual spend. Delta between
 * estimated and actual is reconciled: reserved -= estimated,
 * spent += actual. Safe to call multiple times per step only if
 * caller handles idempotency externally.
 */
export async function commitBudget(
  userId: string,
  yearMonth: string,
  estimatedCents: number,
  actualCents: number
): Promise<void> {
  await db
    .update(userMonthlyUsage)
    .set({
      reservedCents: drizzleSql`GREATEST(${userMonthlyUsage.reservedCents} - ${estimatedCents}, 0)`,
      spentCents: drizzleSql`${userMonthlyUsage.spentCents} + ${actualCents}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userMonthlyUsage.userId, userId),
        eq(userMonthlyUsage.yearMonth, yearMonth)
      )
    );
}

/**
 * Release an unused reservation (e.g. task blocked before tool ran).
 * Reserved -= estimatedCents, spent unchanged.
 */
export async function releaseBudget(
  userId: string,
  yearMonth: string,
  estimatedCents: number
): Promise<void> {
  await db
    .update(userMonthlyUsage)
    .set({
      reservedCents: drizzleSql`GREATEST(${userMonthlyUsage.reservedCents} - ${estimatedCents}, 0)`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userMonthlyUsage.userId, userId),
        eq(userMonthlyUsage.yearMonth, yearMonth)
      )
    );
}

/** Read-only snapshot: current cap + reservation + spend for a user. */
export async function getBudgetSnapshot(userId: string): Promise<{
  plan: string | null;
  period: AiBudgetPeriod;
  capCents: number;
  planCapCents: number;
  grantCents: number;
  reservedCents: number;
  spentCents: number;
  availableCents: number;
  yearMonth: string;
}> {
  const plan = await getUserPlan(userId);
  const period = getAiBudgetPeriod(plan);
  const planCap = getAiBudgetCents(plan);
  const grants = await sumActiveGrantCents(userId);
  const cap = planCap + grants;
  const yearMonth = currentYearMonth(period);

  const [row] = await db
    .select({
      reserved: userMonthlyUsage.reservedCents,
      spent: userMonthlyUsage.spentCents,
    })
    .from(userMonthlyUsage)
    .where(
      and(
        eq(userMonthlyUsage.userId, userId),
        eq(userMonthlyUsage.yearMonth, yearMonth)
      )
    )
    .limit(1);

  const reserved = row?.reserved ?? 0;
  const spent = row?.spent ?? 0;

  return {
    plan,
    period,
    capCents: cap,
    planCapCents: planCap,
    grantCents: grants,
    reservedCents: reserved,
    spentCents: spent,
    availableCents: Math.max(0, cap - reserved - spent),
    yearMonth,
  };
}
