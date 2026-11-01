/**
 * Sticky per-user price assignment (Tim, 2026-10-28).
 *
 * Invariant: a user shown a price on one surface is shown the same price on
 * every surface and in checkout. Every surface (pricing page, claim, onboarding,
 * emails, checkout session creation) must resolve a user's price through
 * `resolveUserPrice`; none may read `PLAN_PRICES` for a user-facing amount once
 * an experiment exists.
 *
 * With no registered experiment (the launch state) every user gets the
 * canonical price. An experiment is only valid with a legal-register check, a
 * control variant equal to the canonical price, a read-out date, and existing
 * payers grandfathered. Assignment is a pure function of
 * (experimentId, userKey), so it is stable across surfaces, sessions and
 * deploys without storing state. Pure and client-importable.
 */

import { ARTIST_VISIBILITY_OFFER } from '@/lib/config/plan-prices';

export interface PriceVariant {
  readonly id: string;
  readonly monthlyUsd: number;
  /** Relative weight; weights need not sum to 100. */
  readonly weight: number;
}

export interface PriceExperiment {
  readonly id: string;
  readonly plan: 'pro';
  /** Legal-register check that cleared this experiment (required). */
  readonly legalRegisterCheckId: string;
  /** Ovie decision card that approved it (required). */
  readonly decisionCardId: string;
  /** ISO date the experiment is read out and decided (kill-date). */
  readonly readOutBy: string;
  readonly variants: readonly PriceVariant[];
}

/** Launch state: no price experiments. Adding one needs the checks above. */
export const PRICE_EXPERIMENTS: readonly PriceExperiment[] = [];

export interface ResolvedUserPrice {
  readonly monthlyUsd: number;
  readonly experimentId: string | null;
  readonly variantId: string;
}

export interface ResolveUserPriceInput {
  /** Stable user identity (user id, or anonymous id persisted in a cookie). */
  readonly userKey: string;
  /** Price an existing payer already pays; always wins (grandfathering). */
  readonly existingPayerMonthlyUsd?: number | null;
}

/** cyrb53: small, fast, deterministic, no crypto dependency. */
function hash53(input: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function assertPriceExperimentsValid(
  experiments: readonly PriceExperiment[],
  canonicalMonthlyUsd: number = ARTIST_VISIBILITY_OFFER.pro.monthlyUsd
): void {
  const plans = new Set<string>();
  for (const e of experiments) {
    if (!e.legalRegisterCheckId.trim()) {
      throw new Error(
        `price experiment ${e.id}: legal-register check required`
      );
    }
    if (!e.decisionCardId.trim()) {
      throw new Error(`price experiment ${e.id}: Ovie decision card required`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.readOutBy)) {
      throw new Error(`price experiment ${e.id}: readOutBy date required`);
    }
    if (e.variants.length < 2 || e.variants.some(v => !(v.weight > 0))) {
      throw new Error(
        `price experiment ${e.id}: needs 2+ positively weighted variants`
      );
    }
    if (
      !e.variants.some(
        v => v.id === 'control' && v.monthlyUsd === canonicalMonthlyUsd
      )
    ) {
      throw new Error(
        `price experiment ${e.id}: control variant must equal the canonical price`
      );
    }
    if (plans.has(e.plan)) {
      throw new Error(
        `price experiment ${e.id}: one concurrent experiment per plan`
      );
    }
    plans.add(e.plan);
  }
}

/**
 * The only function a surface may call for a user-facing monthly price.
 * Deterministic: same (experiments, userKey) always returns the same result.
 */
export function resolveUserPrice(
  input: ResolveUserPriceInput,
  experiments: readonly PriceExperiment[] = PRICE_EXPERIMENTS,
  canonicalMonthlyUsd: number = ARTIST_VISIBILITY_OFFER.pro.monthlyUsd
): ResolvedUserPrice {
  if (input.existingPayerMonthlyUsd != null) {
    return {
      monthlyUsd: input.existingPayerMonthlyUsd,
      experimentId: null,
      variantId: 'grandfathered',
    };
  }
  assertPriceExperimentsValid(experiments, canonicalMonthlyUsd);
  const experiment = experiments.find(e => e.plan === 'pro');
  if (!experiment || !input.userKey) {
    return {
      monthlyUsd: canonicalMonthlyUsd,
      experimentId: null,
      variantId: 'control',
    };
  }
  const total = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
  const point =
    (hash53(`${experiment.id}:${input.userKey}`) % 1_000_000) / 1_000_000;
  let cursor = 0;
  for (const variant of experiment.variants) {
    cursor += variant.weight / total;
    if (point < cursor) {
      return {
        monthlyUsd: variant.monthlyUsd,
        experimentId: experiment.id,
        variantId: variant.id,
      };
    }
  }
  const last = experiment.variants[experiment.variants.length - 1];
  return {
    monthlyUsd: last.monthlyUsd,
    experimentId: experiment.id,
    variantId: last.id,
  };
}
