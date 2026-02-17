import { describe, expect, it } from 'vitest';
import {
  type BooleanEntitlement,
  ENTITLEMENT_REGISTRY,
  getAllPlanIds,
  type NumericEntitlement,
  type PlanId,
} from '@/lib/entitlements/registry';

describe('Entitlement Registry Consistency', () => {
  const planIds = getAllPlanIds();

  it('every plan ID in registry matches getAllPlanIds()', () => {
    const registryKeys = Object.keys(ENTITLEMENT_REGISTRY) as PlanId[];
    expect(registryKeys).toEqual(expect.arrayContaining([...planIds]));
    expect(planIds).toEqual(expect.arrayContaining(registryKeys));
  });

  it('all boolean keys are present in every plan', () => {
    const booleanKeys: BooleanEntitlement[] = [
      'canRemoveBranding',
      'canExportContacts',
      'canAccessAdvancedAnalytics',
      'canFilterSelfFromAnalytics',
      'canAccessAdPixels',
      'canBeVerified',
      'aiCanUseTools',
    ];

    for (const planId of planIds) {
      const booleans = ENTITLEMENT_REGISTRY[planId].booleans;
      for (const key of booleanKeys) {
        expect(booleans).toHaveProperty(key);
        expect(typeof booleans[key]).toBe('boolean');
      }
    }
  });

  it('all numeric keys are present in every plan', () => {
    const numericKeys: NumericEntitlement[] = [
      'analyticsRetentionDays',
      'contactsLimit',
      'smartLinksLimit',
      'aiDailyMessageLimit',
    ];

    for (const planId of planIds) {
      const limits = ENTITLEMENT_REGISTRY[planId].limits;
      for (const key of numericKeys) {
        expect(limits).toHaveProperty(key);
        const val = limits[key];
        expect(val === null || typeof val === 'number').toBe(true);
      }
    }
  });

  it('boolean escalation: if pro is true, growth must also be true', () => {
    const proBooleans = ENTITLEMENT_REGISTRY.pro.booleans;
    const growthBooleans = ENTITLEMENT_REGISTRY.growth.booleans;

    for (const [key, proValue] of Object.entries(proBooleans)) {
      if (proValue === true) {
        expect(growthBooleans[key as BooleanEntitlement]).toBe(true);
      }
    }
  });

  it('numeric escalation: growth >= pro >= free (where not null)', () => {
    const plans: PlanId[] = ['free', 'pro', 'growth'];

    const numericKeys: NumericEntitlement[] = [
      'analyticsRetentionDays',
      'aiDailyMessageLimit',
    ];

    for (const key of numericKeys) {
      for (let i = 0; i < plans.length - 1; i++) {
        const lower = ENTITLEMENT_REGISTRY[plans[i]].limits[key];
        const higher = ENTITLEMENT_REGISTRY[plans[i + 1]].limits[key];

        // Both non-null: higher tier should be >= lower tier
        if (typeof lower === 'number' && typeof higher === 'number') {
          expect(higher).toBeGreaterThanOrEqual(lower);
        }
      }
    }

    // For nullable limits (contactsLimit, smartLinksLimit): null = unlimited,
    // so null is always >= any number
    const nullableKeys: NumericEntitlement[] = [
      'contactsLimit',
      'smartLinksLimit',
    ];

    for (const key of nullableKeys) {
      for (let i = 0; i < plans.length - 1; i++) {
        const lower = ENTITLEMENT_REGISTRY[plans[i]].limits[key];
        const higher = ENTITLEMENT_REGISTRY[plans[i + 1]].limits[key];

        if (lower !== null && higher !== null) {
          expect(higher).toBeGreaterThanOrEqual(lower);
        }
        // If lower is a number and higher is null (unlimited), that's fine
        // If lower is null (unlimited), higher must also be null
        if (lower === null) {
          expect(higher).toBeNull();
        }
      }
    }
  });

  it('marketing features are non-empty for all plans', () => {
    for (const planId of planIds) {
      const features = ENTITLEMENT_REGISTRY[planId].marketing.features;
      expect(features.length).toBeGreaterThan(0);
    }
  });

  it('marketing displayName is non-empty for all plans', () => {
    for (const planId of planIds) {
      expect(ENTITLEMENT_REGISTRY[planId].marketing.displayName).toBeTruthy();
    }
  });

  it('free plan has null price, paid plans have prices', () => {
    expect(ENTITLEMENT_REGISTRY.free.marketing.price).toBeNull();
    expect(ENTITLEMENT_REGISTRY.pro.marketing.price).not.toBeNull();
    expect(ENTITLEMENT_REGISTRY.growth.marketing.price).not.toBeNull();
  });

  it('paid plan prices: monthly and yearly are positive', () => {
    for (const planId of ['pro', 'growth'] as const) {
      const price = ENTITLEMENT_REGISTRY[planId].marketing.price!;
      expect(price.monthly).toBeGreaterThan(0);
      expect(price.yearly).toBeGreaterThan(0);
      // Yearly should be less than 12x monthly (a discount)
      expect(price.yearly).toBeLessThan(price.monthly * 12);
    }
  });

  it('registry plan IDs match UserPlan type values', () => {
    // UserPlan = 'free' | 'pro' | 'growth' in types/index.ts
    const expectedPlans: PlanId[] = ['free', 'pro', 'growth'];
    expect([...planIds]).toEqual(expectedPlans);
  });
});
