/**
 * Property-based tests for plan entitlement resolution (registry.ts).
 *
 * Locks the resolution laws the billing surface depends on:
 * - legacy aliases resolve to their canonical tier's entitlements
 * - unrecognized plan strings always fail closed to Free
 * - tier capabilities are monotonic (free <= trial <= pro <= max)
 * - plan predicates agree with resolveCanonicalPlanId for every input
 * - registry marketing prices stay derived from plan-prices (single source)
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  ARTIST_VISIBILITY_OFFER,
  PLAN_PRICES,
  toCents,
} from '@/lib/config/plan-prices';
import {
  type BooleanEntitlement,
  checkBoolean,
  ENTITLEMENT_REGISTRY,
  getEntitlements,
  getLimit,
  hasAdvancedFeatures,
  isProPlan,
  isValidPlanId,
  type NumericEntitlement,
  type PlanEntitlements,
  type PlanId,
  resolveCanonicalPlanId,
  resolveChatUsagePlan,
} from '@/lib/entitlements/registry';

const CANONICAL_PLAN_IDS: readonly PlanId[] = ['free', 'trial', 'pro', 'max'];
const RECOGNIZED = new Set([...CANONICAL_PLAN_IDS, 'founding', 'growth']);

const canonicalPlanArb = fc.constantFrom(...CANONICAL_PLAN_IDS);
const recognizedPlanArb = fc.constantFrom(...RECOGNIZED);
const unrecognizedPlanArb = fc
  .string({ minLength: 0, maxLength: 32 })
  .filter(value => !RECOGNIZED.has(value));
const anyPlanArb = fc.oneof(recognizedPlanArb, unrecognizedPlanArb);

const booleanKeys = Object.keys(
  ENTITLEMENT_REGISTRY.free.booleans
) as BooleanEntitlement[];

const limitKeys = Object.keys(
  ENTITLEMENT_REGISTRY.free.limits
) as NumericEntitlement[];

/** Ordered low -> high tier for monotonicity laws. */
const TIER_ORDER: readonly PlanId[] = ['free', 'trial', 'pro', 'max'];

/** Limits where a larger value is a strictly better entitlement. */
const MORE_IS_BETTER_UNLIMITED_NULL: ReadonlySet<NumericEntitlement> = new Set([
  'analyticsRetentionDays',
  'contactsLimit',
  'smartLinksLimit',
  'aiPitchGenPerRelease',
  'chatFileUploadLimit',
  'profileMonitoringLimit',
] satisfies NumericEntitlement[]);

function rank(value: number | null, nullIsUnlimited: boolean): number {
  if (value === null) return nullIsUnlimited ? Number.POSITIVE_INFINITY : 0;
  return value;
}

describe('entitlement resolution (property)', () => {
  it('recognized plans resolve to their canonical tier, aliases included', () => {
    fc.assert(
      fc.property(recognizedPlanArb, plan => {
        const canonical = resolveCanonicalPlanId(plan);
        expect(canonical).not.toBeNull();
        expect(getEntitlements(plan)).toEqual(
          ENTITLEMENT_REGISTRY[canonical as PlanId]
        );
      })
    );
  });

  it('legacy aliases are indistinguishable from their canonical tier', () => {
    fc.assert(
      fc.property(canonicalPlanArb, canonical => {
        for (const [alias, target] of [
          ['founding', 'pro'],
          ['growth', 'max'],
        ] as const) {
          if (canonical !== target) continue;
          expect(getEntitlements(alias)).toEqual(
            ENTITLEMENT_REGISTRY[canonical]
          );
          expect(isProPlan(alias)).toBe(isProPlan(canonical));
          expect(hasAdvancedFeatures(alias)).toBe(
            hasAdvancedFeatures(canonical)
          );
          expect(resolveChatUsagePlan(alias)).toBe(
            resolveChatUsagePlan(canonical)
          );
        }
      })
    );
  });

  it('unrecognized plans fail closed to Free entitlements', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          unrecognizedPlanArb,
          fc.constantFrom(null, undefined, ''),
          fc.constantFrom('FREE', 'Pro', 'pro ', 'maxx', 'found', 'growth2')
        ),
        plan => {
          expect(getEntitlements(plan)).toEqual(ENTITLEMENT_REGISTRY.free);
          expect(resolveCanonicalPlanId(plan)).toBeNull();
          expect(isValidPlanId(plan)).toBe(false);
          expect(resolveChatUsagePlan(plan)).toBe('free');
        }
      )
    );
  });

  it('resolveCanonicalPlanId is idempotent and fixes canonical ids', () => {
    fc.assert(
      fc.property(anyPlanArb, plan => {
        const once = resolveCanonicalPlanId(plan);
        expect(resolveCanonicalPlanId(once)).toEqual(once);
        for (const canonical of CANONICAL_PLAN_IDS) {
          expect(resolveCanonicalPlanId(canonical)).toBe(canonical);
        }
      })
    );
  });

  it('plan predicates are fully derived from resolveCanonicalPlanId', () => {
    fc.assert(
      fc.property(anyPlanArb, plan => {
        const canonical = resolveCanonicalPlanId(plan);
        expect(isValidPlanId(plan)).toBe(canonical !== null);
        expect(isProPlan(plan)).toBe(
          canonical === 'pro' || canonical === 'trial' || canonical === 'max'
        );
        expect(hasAdvancedFeatures(plan)).toBe(canonical === 'max');
        expect(resolveChatUsagePlan(plan)).toBe(canonical ?? 'free');
      })
    );
  });

  it('checkBoolean and getLimit delegate to getEntitlements', () => {
    fc.assert(
      fc.property(
        anyPlanArb,
        fc.constantFrom(...booleanKeys),
        fc.constantFrom(...limitKeys),
        (plan, booleanKey, limitKey) => {
          const entitlements = getEntitlements(plan);
          expect(checkBoolean(plan, booleanKey)).toBe(
            entitlements.booleans[booleanKey]
          );
          expect(getLimit(plan, limitKey)).toBe(entitlements.limits[limitKey]);
        }
      )
    );
  });

  it('boolean capabilities never regress up the tier order', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...booleanKeys),
        fc.nat({ max: TIER_ORDER.length - 2 }),
        (key, lowerIndex) => {
          const lower: PlanEntitlements =
            ENTITLEMENT_REGISTRY[TIER_ORDER[lowerIndex]];
          const upper: PlanEntitlements =
            ENTITLEMENT_REGISTRY[TIER_ORDER[lowerIndex + 1]];
          if (lower.booleans[key]) {
            expect(upper.booleans[key]).toBe(true);
          }
        }
      )
    );
  });

  it('numeric limits never regress up the tier order', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...limitKeys),
        fc.nat({ max: TIER_ORDER.length - 2 }),
        (key, lowerIndex) => {
          const lower =
            ENTITLEMENT_REGISTRY[TIER_ORDER[lowerIndex]].limits[key];
          const upper =
            ENTITLEMENT_REGISTRY[TIER_ORDER[lowerIndex + 1]].limits[key];
          const nullIsUnlimited = MORE_IS_BETTER_UNLIMITED_NULL.has(key);
          expect(rank(upper, nullIsUnlimited)).toBeGreaterThanOrEqual(
            rank(lower, nullIsUnlimited)
          );
        }
      )
    );
  });

  it('marketing prices stay derived from plan-prices and the published offer', () => {
    fc.assert(
      fc.property(canonicalPlanArb, plan => {
        const { marketing } = ENTITLEMENT_REGISTRY[plan];
        switch (plan) {
          case 'free':
          case 'trial':
            expect(marketing.price).toBeNull();
            break;
          case 'pro':
            expect(marketing.price?.monthly).toBe(PLAN_PRICES.pro.monthly);
            expect(marketing.price?.monthly).toBe(
              ARTIST_VISIBILITY_OFFER.pro.monthlyUsd
            );
            expect(marketing.price?.yearly).toBeNull();
            break;
          case 'max':
            expect(marketing.price?.monthly).toBe(PLAN_PRICES.max.monthly);
            expect(marketing.price?.yearly).toBe(PLAN_PRICES.max.yearly);
            break;
        }
      })
    );
    expect(toCents(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd)).toBe(1200);
    expect(ARTIST_VISIBILITY_OFFER.pro.currency).toBe('usd');
    expect(ARTIST_VISIBILITY_OFFER.pro.interval).toBe('month');
  });
});
