import { describe, expect, it } from 'vitest';
import {
  type BooleanEntitlement,
  ENTITLEMENT_REGISTRY,
  getAllPlanIds,
  getEntitlements,
  hasAdvancedFeatures,
  isProPlan,
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
      'canExportContacts',
      'canAccessAdvancedAnalytics',
      'canFilterSelfFromAnalytics',
      'canAccessAdPixels',
      'canBeVerified',
      'aiCanUseTools',
      'canCreateManualReleases',
      'canAccessMetadataSubmissionAgent',
      'canAccessFutureReleases',
      'canSendNotifications',
      'canEditSmartLinks',
      'canAccessInbox',
      'canAccessPreSave',
      'canAccessTipping',
      'canAccessUrlEncryption',
      'canAccessStripeConnect',
      'canAccessFanSubscriptions',
      'canAccessEmailCampaigns',
      'canAccessApiKeys',
      'canAccessTeamManagement',
      'canAccessWebhooks',
      'canAccessWhiteLabel',
      'canAccessAbTesting',
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
      'aiPitchGenPerRelease',
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

  it('boolean escalation: if pro is true, max must also be true', () => {
    const proBooleans = ENTITLEMENT_REGISTRY.pro.booleans;
    const growthBooleans = ENTITLEMENT_REGISTRY.max.booleans;

    for (const [key, proValue] of Object.entries(proBooleans)) {
      if (proValue === true) {
        expect(growthBooleans[key as BooleanEntitlement]).toBe(true);
      }
    }
  });

  it('numeric escalation: max >= pro >= free (where not null)', () => {
    const plans: PlanId[] = ['free', 'pro', 'max'];

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

  it('free plan marketing list includes unlimited smart links', () => {
    expect(ENTITLEMENT_REGISTRY.free.marketing.features).toContain(
      'Unlimited smart links'
    );
  });

  it('release notifications are paid-only in marketing and booleans', () => {
    expect(ENTITLEMENT_REGISTRY.free.booleans.canSendNotifications).toBe(false);
    expect(ENTITLEMENT_REGISTRY.free.marketing.features).not.toContain(
      'Release notifications'
    );
    expect(ENTITLEMENT_REGISTRY.pro.booleans.canSendNotifications).toBe(true);
    expect(ENTITLEMENT_REGISTRY.pro.marketing.features).toContain(
      'Release notifications to fans'
    );
  });

  it('paid plan marketing lists reference free features', () => {
    for (const planId of planIds) {
      if (planId === 'free') continue;
      const features = ENTITLEMENT_REGISTRY[planId].marketing.features;
      const referencesFreeTier = features.some(
        f => f.includes('All Free features') || f.includes('All Pro features')
      );
      expect(referencesFreeTier).toBe(true);
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
    expect(ENTITLEMENT_REGISTRY.max.marketing.price).not.toBeNull();
  });

  it('paid plan prices: monthly is positive', () => {
    for (const planId of ['pro', 'max'] as const) {
      const price = ENTITLEMENT_REGISTRY[planId].marketing.price!;
      expect(price.monthly).toBeGreaterThan(0);
    }
  });

  it('plans with yearly pricing offer a discount', () => {
    for (const planId of ['pro', 'max'] as const) {
      const price = ENTITLEMENT_REGISTRY[planId].marketing.price!;
      expect(price.yearly).toBeGreaterThan(0);
      // Yearly should be less than 12x monthly (a discount)
      expect(price.yearly).toBeLessThan(price.monthly * 12);
    }
  });

  it('registry plan IDs match PlanId type values', () => {
    // PlanId = 'free' | 'trial' | 'pro' | 'max' in registry.ts
    const expectedPlans: PlanId[] = ['free', 'trial', 'pro', 'max'];
    expect([...planIds]).toEqual(expectedPlans);
  });

  // -------------------------------------------------------------------
  // Backward compatibility: DB may still store legacy plan names
  // -------------------------------------------------------------------

  it('getEntitlements("founding") returns pro entitlements (backward compat)', () => {
    expect(getEntitlements('founding')).toBe(ENTITLEMENT_REGISTRY.pro);
  });

  it('isProPlan("founding") returns true (backward compat)', () => {
    expect(isProPlan('founding')).toBe(true);
  });

  it('getEntitlements("growth") returns max entitlements (backward compat)', () => {
    expect(getEntitlements('growth')).toBe(ENTITLEMENT_REGISTRY.max);
  });

  it('isProPlan("growth") returns true (backward compat)', () => {
    expect(isProPlan('growth')).toBe(true);
  });

  it('hasAdvancedFeatures("growth") returns true (backward compat)', () => {
    expect(hasAdvancedFeatures('growth')).toBe(true);
  });
});
