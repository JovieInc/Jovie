import { describe, expect, it } from 'vitest';
import {
  ENTITLEMENT_REGISTRY,
  getEntitlements,
  getPlanDisplayName,
  hasAdvancedFeatures,
  isProPlan,
} from '@/lib/entitlements/registry';

describe('Plan Configuration (Entitlement Registry)', () => {
  describe('ENTITLEMENT_REGISTRY', () => {
    it('free plan has correct limits', () => {
      const free = ENTITLEMENT_REGISTRY.free;
      expect(free.limits).toEqual({
        analyticsRetentionDays: 7,
        contactsLimit: 100,
        smartLinksLimit: 5,
        aiDailyMessageLimit: 5,
      });
      expect(free.booleans).toEqual({
        canExportContacts: false,
        canRemoveBranding: false,
        canAccessAdvancedAnalytics: false,
        canFilterSelfFromAnalytics: false,
        canAccessAdPixels: false,
        canBeVerified: false,
        aiCanUseTools: false,
      });
    });

    it('pro plan has correct limits', () => {
      const pro = ENTITLEMENT_REGISTRY.pro;
      expect(pro.limits).toEqual({
        analyticsRetentionDays: 90,
        contactsLimit: null,
        smartLinksLimit: null,
        aiDailyMessageLimit: 100,
      });
      expect(pro.booleans).toEqual({
        canExportContacts: true,
        canRemoveBranding: true,
        canAccessAdvancedAnalytics: true,
        canFilterSelfFromAnalytics: true,
        canAccessAdPixels: true,
        canBeVerified: true,
        aiCanUseTools: true,
      });
    });

    it('growth plan has correct limits', () => {
      const growth = ENTITLEMENT_REGISTRY.growth;
      expect(growth.limits).toEqual({
        analyticsRetentionDays: 365,
        contactsLimit: null,
        smartLinksLimit: null,
        aiDailyMessageLimit: 500,
      });
      expect(growth.booleans).toEqual({
        canExportContacts: true,
        canRemoveBranding: true,
        canAccessAdvancedAnalytics: true,
        canFilterSelfFromAnalytics: true,
        canAccessAdPixels: true,
        canBeVerified: true,
        aiCanUseTools: true,
      });
    });

    it('free plan contacts limit is exactly 100', () => {
      expect(ENTITLEMENT_REGISTRY.free.limits.contactsLimit).toBe(100);
    });

    it('pro and growth have unlimited contacts (null)', () => {
      expect(ENTITLEMENT_REGISTRY.pro.limits.contactsLimit).toBeNull();
      expect(ENTITLEMENT_REGISTRY.growth.limits.contactsLimit).toBeNull();
    });
  });

  describe('getEntitlements', () => {
    it('returns free entitlements for null plan', () => {
      expect(getEntitlements(null)).toEqual(ENTITLEMENT_REGISTRY.free);
    });

    it('returns free entitlements for unknown plan', () => {
      expect(getEntitlements('unknown')).toEqual(ENTITLEMENT_REGISTRY.free);
    });

    it('returns free entitlements for "free" plan', () => {
      expect(getEntitlements('free')).toEqual(ENTITLEMENT_REGISTRY.free);
    });

    it('returns pro entitlements for "pro" plan', () => {
      expect(getEntitlements('pro')).toEqual(ENTITLEMENT_REGISTRY.pro);
    });

    it('returns growth entitlements for "growth" plan', () => {
      expect(getEntitlements('growth')).toEqual(ENTITLEMENT_REGISTRY.growth);
    });
  });

  describe('isProPlan', () => {
    it('returns false for null', () => {
      expect(isProPlan(null)).toBe(false);
    });

    it('returns false for "free"', () => {
      expect(isProPlan('free')).toBe(false);
    });

    it('returns true for "pro"', () => {
      expect(isProPlan('pro')).toBe(true);
    });

    it('returns true for "growth"', () => {
      expect(isProPlan('growth')).toBe(true);
    });
  });

  describe('hasAdvancedFeatures', () => {
    it('returns false for null', () => {
      expect(hasAdvancedFeatures(null)).toBe(false);
    });

    it('returns false for "free"', () => {
      expect(hasAdvancedFeatures('free')).toBe(false);
    });

    it('returns false for "pro"', () => {
      expect(hasAdvancedFeatures('pro')).toBe(false);
    });

    it('returns true only for "growth"', () => {
      expect(hasAdvancedFeatures('growth')).toBe(true);
    });
  });

  describe('getPlanDisplayName', () => {
    it('returns "Free" for null', () => {
      expect(getPlanDisplayName(null)).toBe('Free');
    });

    it('returns correct display names', () => {
      expect(getPlanDisplayName('free')).toBe('Free');
      expect(getPlanDisplayName('pro')).toBe('Pro');
      expect(getPlanDisplayName('growth')).toBe('Growth');
    });

    it('returns "Free" for unknown plan strings', () => {
      expect(getPlanDisplayName('enterprise')).toBe('Free');
      expect(getPlanDisplayName('')).toBe('Free');
      expect(getPlanDisplayName('GROWTH')).toBe('Free');
    });
  });

  describe('Edge cases across all helpers', () => {
    it('getEntitlements falls back to free for empty string', () => {
      expect(getEntitlements('')).toEqual(ENTITLEMENT_REGISTRY.free);
    });

    it('getEntitlements falls back to free for undefined', () => {
      expect(getEntitlements(undefined)).toEqual(ENTITLEMENT_REGISTRY.free);
    });

    it('isProPlan rejects case-mismatched strings', () => {
      expect(isProPlan('Pro')).toBe(false);
      expect(isProPlan('PRO')).toBe(false);
      expect(isProPlan('Growth')).toBe(false);
      expect(isProPlan('GROWTH')).toBe(false);
    });

    it('isProPlan rejects empty string', () => {
      expect(isProPlan('')).toBe(false);
    });

    it('hasAdvancedFeatures rejects case-mismatched growth', () => {
      expect(hasAdvancedFeatures('Growth')).toBe(false);
      expect(hasAdvancedFeatures('GROWTH')).toBe(false);
    });

    it('plan hierarchy: growth > pro > free for retention days', () => {
      expect(
        ENTITLEMENT_REGISTRY.growth.limits.analyticsRetentionDays
      ).toBeGreaterThan(ENTITLEMENT_REGISTRY.pro.limits.analyticsRetentionDays);
      expect(
        ENTITLEMENT_REGISTRY.pro.limits.analyticsRetentionDays
      ).toBeGreaterThan(
        ENTITLEMENT_REGISTRY.free.limits.analyticsRetentionDays
      );
    });

    it('all paid plans have unlimited contacts (null)', () => {
      const paidPlans = ['pro', 'growth'] as const;
      for (const plan of paidPlans) {
        expect(ENTITLEMENT_REGISTRY[plan].limits.contactsLimit).toBeNull();
      }
    });

    it('all paid plans enable all boolean features', () => {
      const paidPlans = ['pro', 'growth'] as const;
      for (const plan of paidPlans) {
        for (const [, value] of Object.entries(
          ENTITLEMENT_REGISTRY[plan].booleans
        )) {
          expect(value).toBe(true);
        }
      }
    });

    it('free plan disables all boolean features', () => {
      for (const [, value] of Object.entries(
        ENTITLEMENT_REGISTRY.free.booleans
      )) {
        expect(value).toBe(false);
      }
    });
  });
});
