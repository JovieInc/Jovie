import { z } from 'zod';
import type { DefaultAliveInputs, SourcedInput } from './engine';

/**
 * Input assembly for the default-alive engine. Pure: callers pass in what
 * they read (Stripe revenue, the spend registry, founder attestations).
 * Real figures never live in this public repo; they arrive at runtime.
 */

const DAYS_PER_MONTH = 30.436875;

const sourcedNumber = z.object({
  value: z.number().finite().nullable(),
  source: z.string().min(1),
  asOf: z.string().min(1).nullable(),
});

/** Use-of-funds plan. Owned by the financial-plan agent's registry file. */
export const raisePlanSchema = z.object({
  milestone: z.string().min(1),
  milestoneMonths: z.number().positive(),
  milestoneSource: z.string().min(1),
  lines: z
    .array(
      z.object({
        label: z.string().min(1),
        usdPerMonth: z.number().finite().nonnegative(),
        source: z.string().min(1),
        basis: z.enum([
          'assumption',
          'founder-attested',
          'measured',
          'registry-cap',
        ]),
      })
    )
    .min(1)
    .max(20),
  offer: z
    .object({ usd: z.number().positive(), source: z.string().min(1) })
    .nullable()
    .optional(),
});

/**
 * Founder attestations. Cash is attested until a bank connector exists
 * (access gap: read-only bank API). Growth rates are optional; omitted
 * becomes an explicit gap, never zero.
 */
export const attestedFinanceSchema = z.object({
  cashUsd: sourcedNumber,
  fixedBurnUsdPerMonth: sourcedNumber,
  variableBurnUsdPerMonth: sourcedNumber.optional(),
  mrrUsd: sourcedNumber.optional(),
  mrrGrowthRateMonthly: sourcedNumber.optional(),
  expenseGrowthRateMonthly: sourcedNumber.optional(),
  plan: raisePlanSchema.nullable().optional(),
});

export type AttestedFinance = z.infer<typeof attestedFinanceSchema>;

interface SpendProvider {
  readonly id: string;
  readonly kind: string;
  readonly funding?: { readonly source?: string } | null;
  readonly cap?: {
    readonly amountUsd?: number;
    readonly period?: string;
  } | null;
}

interface SpendRegistryLike {
  readonly updatedAt: string;
  readonly providers: readonly SpendProvider[];
}

function monthlyCap(cap: SpendProvider['cap']): number | null {
  if (!cap || typeof cap.amountUsd !== 'number') return null;
  switch (cap.period) {
    case 'day':
      return cap.amountUsd * DAYS_PER_MONTH;
    case 'month':
    case 'billing-cycle':
      return cap.amountUsd;
    default:
      return null;
  }
}

/**
 * Variable burn upper bound: the sum of monthly caps on cash-funded,
 * usage-metered spend lines in `ops/registry/spend.json`. Lines funded by
 * credits are excluded (they do not draw cash). It is a ceiling, so it
 * over- rather than under-states burn.
 */
export function variableBurnFromSpendRegistry(
  registry: SpendRegistryLike
): SourcedInput<number> {
  const counted: string[] = [];
  let total = 0;
  for (const line of registry.providers) {
    if (line.kind !== 'capped-spend') continue;
    if (line.funding?.source === 'credits') continue;
    const monthly = monthlyCap(line.cap);
    if (monthly === null) continue;
    total += monthly;
    counted.push(line.id);
  }
  return {
    value: counted.length > 0 ? Math.round(total * 100) / 100 : null,
    source: `ops/registry/spend.json monthly caps on cash-funded capped-spend lines (${counted.join(', ') || 'none'})`,
    asOf: registry.updatedAt,
    basis: 'registry-cap',
  };
}

/** Shape of `getSummerRevenue()` (Summer's company revenue read). */
interface SummerRevenueLike {
  readonly observedAt: string;
  readonly jovie:
    | { readonly status: 'unavailable'; readonly reason: string }
    | { readonly mrrUsd: number; readonly source: string };
}

export function mrrFromSummerRevenue(
  revenue: SummerRevenueLike
): SourcedInput<number> {
  if ('status' in revenue.jovie) {
    return {
      value: null,
      source: `summer-company/revenue: ${revenue.jovie.reason}`,
      asOf: revenue.observedAt,
      basis: 'measured',
    };
  }
  return {
    value: revenue.jovie.mrrUsd,
    source: `summer-company/revenue (${revenue.jovie.source}, customer-only MRR)`,
    asOf: revenue.observedAt,
    basis: 'measured',
  };
}

function missing(source: string): SourcedInput<number> {
  return { value: null, source, asOf: null, basis: 'founder-attested' };
}

function attested(
  input: z.infer<typeof sourcedNumber> | undefined,
  fallbackSource: string
): SourcedInput<number> {
  return input
    ? { ...input, basis: 'founder-attested' }
    : missing(fallbackSource);
}

/**
 * Merge measured sources over attestations. Measured MRR and registry
 * variable burn win when present; attested values fill the rest.
 */
export function assembleDefaultAliveInputs(input: {
  readonly attested: AttestedFinance | null;
  readonly mrr?: SourcedInput<number> | null;
  readonly variableBurn?: SourcedInput<number> | null;
  /** Plan from the financial-plan source of truth; wins over an attested one. */
  readonly plan?: z.infer<typeof raisePlanSchema> | null;
}): DefaultAliveInputs {
  const a = input.attested;
  const noAttestation = 'no founder attestation supplied';
  const mrr =
    input.mrr && input.mrr.value !== null
      ? input.mrr
      : a?.mrrUsd
        ? attested(a.mrrUsd, noAttestation)
        : (input.mrr ?? missing('no MRR source'));
  const variableBurn =
    input.variableBurn && input.variableBurn.value !== null
      ? input.variableBurn
      : attested(a?.variableBurnUsdPerMonth, 'no variable burn source');
  return {
    cashUsd: a
      ? attested(a.cashUsd, noAttestation)
      : missing('no bank connector; founder attestation required'),
    fixedBurnUsdPerMonth: attested(a?.fixedBurnUsdPerMonth, noAttestation),
    variableBurnUsdPerMonth: variableBurn,
    mrrUsd: mrr,
    mrrGrowthRateMonthly: attested(a?.mrrGrowthRateMonthly, 'no MRR history'),
    expenseGrowthRateMonthly: attested(
      a?.expenseGrowthRateMonthly,
      'no expense history'
    ),
    plan: input.plan ?? a?.plan ?? null,
  };
}
