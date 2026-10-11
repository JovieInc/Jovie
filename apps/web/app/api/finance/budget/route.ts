import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isUnauthorizedSessionError } from '@/lib/auth/session';
import {
  deleteBudgetTarget,
  getBudgetSettings,
  listBudgetMonthTransactions,
  listBudgetTargets,
  upsertBudgetSettings,
  upsertBudgetTarget,
} from '@/lib/finance/budget-repository';
import {
  BUDGET_BASELINE_MONTH,
  FINANCE_BUDGET_CATEGORIES,
  isValidBudgetMonth,
  isValidBudgetScope,
  summarizeBudget,
} from '@/lib/finance/budgets';
import {
  assertCreatorFinanceEnabled,
  FinanceFeatureDisabledError,
} from '@/lib/finance/flags';
import { requireFinancialOwnerId } from '@/lib/finance/owner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Owner-only monthly budget API (JOV-4620).
 *
 * The financial owner is resolved from the authenticated session only —
 * there is deliberately no owner/creator parameter, so no caller can read or
 * write another owner's budget. When the feature flag is off the route
 * returns a bare 404 so a disabled surface is indistinguishable from an
 * absent one.
 */

const targetSchema = z.object({
  category: z.enum(FINANCE_BUDGET_CATEGORIES),
  month: z
    .string()
    .refine(isValidBudgetScope, 'Expected YYYY-MM or baseline')
    .default(BUDGET_BASELINE_MONTH),
  amount: z.number().finite().min(0).max(1_000_000_000),
});

const putSchema = z.object({
  targets: z.array(targetSchema).max(200),
  includedAccountIds: z.array(z.string().uuid()).max(100).nullish(),
});

const deleteSchema = z.object({
  category: z.enum(FINANCE_BUDGET_CATEGORIES),
  month: z.string().refine(isValidBudgetScope, 'Expected YYYY-MM or baseline'),
});

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

async function authorize(): Promise<
  { ok: true; ownerUserId: string } | { ok: false; response: NextResponse }
> {
  try {
    const ownerUserId = await requireFinancialOwnerId();
    await assertCreatorFinanceEnabled(ownerUserId);
    return { ok: true, ownerUserId };
  } catch (error) {
    if (isUnauthorizedSessionError(error)) {
      return { ok: false, response: jsonError(401, 'Unauthorized') };
    }
    if (error instanceof FinanceFeatureDisabledError) {
      return { ok: false, response: jsonError(404, 'Not found') };
    }
    throw error;
  }
}

export async function GET(request: Request) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;

  const monthParam = new URL(request.url).searchParams.get('month');
  const month =
    monthParam === null
      ? new Date().toISOString().slice(0, 7)
      : isValidBudgetMonth(monthParam)
        ? monthParam
        : null;
  if (!month) return jsonError(400, 'Invalid month');

  const [targets, settings, transactions] = await Promise.all([
    listBudgetTargets(auth.ownerUserId, month),
    getBudgetSettings(auth.ownerUserId),
    listBudgetMonthTransactions(auth.ownerUserId, month),
  ]);

  return NextResponse.json({
    budget: summarizeBudget({
      month,
      targets,
      transactions,
      includedAccountIds: settings?.includedAccountIds ?? null,
    }),
  });
}

export async function PUT(request: Request) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'Invalid budget');

  for (const target of parsed.data.targets) {
    await upsertBudgetTarget(auth.ownerUserId, target);
  }
  if (parsed.data.includedAccountIds !== undefined) {
    await upsertBudgetSettings(auth.ownerUserId, {
      includedAccountIds: parsed.data.includedAccountIds ?? null,
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'Invalid budget target');

  await deleteBudgetTarget(auth.ownerUserId, parsed.data);
  return NextResponse.json({ ok: true });
}
