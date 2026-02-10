import { describe, expect, it } from 'vitest';
import {
  getPlanDisplayName,
  getPlanLimits,
  hasAdvancedFeatures,
  isProPlan,
  PLAN_LIMITS,
} from '@/lib/stripe/config';

describe('Plan Configuration', () => {
  describe('PLAN_LIMITS', () => {
    it('free plan has correct limits', () => {
      expect(PLAN_LIMITS.free).toEqual({
        analyticsRetentionDays: 7,
        contactsLimit: 100,
        canExportContacts: false,
        canRemoveBranding: false,
        canAccessAdvancedAnalytics: false,
        canFilterSelfFromAnalytics: false,
      });
    });

    it('pro plan has correct limits', () => {
      expect(PLAN_LIMITS.pro).toEqual({
        analyticsRetentionDays: 90,
        contactsLimit: null,
        canExportContacts: true,
        canRemoveBranding: true,
        canAccessAdvancedAnalytics: true,
        canFilterSelfFromAnalytics: true,
      });
    });

    it('growth plan has correct limits', () => {
      expect(PLAN_LIMITS.growth).toEqual({
        analyticsRetentionDays: 365,
        contactsLimit: null,
        canExportContacts: true,
        canRemoveBranding: true,
        canAccessAdvancedAnalytics: true,
        canFilterSelfFromAnalytics: true,
      });
    });

    it('free plan contacts limit is exactly 100', () => {
      expect(PLAN_LIMITS.free.contactsLimit).toBe(100);
    });

    it('pro and growth have unlimited contacts (null)', () => {
      expect(PLAN_LIMITS.pro.contactsLimit).toBeNull();
      expect(PLAN_LIMITS.growth.contactsLimit).toBeNull();
    });
  });

  describe('getPlanLimits', () => {
    it('returns free limits for null plan', () => {
      expect(getPlanLimits(null)).toEqual(PLAN_LIMITS.free);
    });

    it('returns free limits for unknown plan', () => {
      expect(getPlanLimits('unknown')).toEqual(PLAN_LIMITS.free);
    });

    it('returns free limits for "free" plan', () => {
      expect(getPlanLimits('free')).toEqual(PLAN_LIMITS.free);
    });

    it('returns pro limits for "pro" plan', () => {
      expect(getPlanLimits('pro')).toEqual(PLAN_LIMITS.pro);
    });

    it('returns growth limits for "growth" plan', () => {
      expect(getPlanLimits('growth')).toEqual(PLAN_LIMITS.growth);
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
    it('getPlanLimits falls back to free for empty string', () => {
      expect(getPlanLimits('')).toEqual(PLAN_LIMITS.free);
    });

    it('getPlanLimits falls back to free for undefined', () => {
      expect(getPlanLimits(undefined as unknown as string)).toEqual(
        PLAN_LIMITS.free
      );
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
      expect(PLAN_LIMITS.growth.analyticsRetentionDays).toBeGreaterThan(
        PLAN_LIMITS.pro.analyticsRetentionDays
      );
      expect(PLAN_LIMITS.pro.analyticsRetentionDays).toBeGreaterThan(
        PLAN_LIMITS.free.analyticsRetentionDays
      );
    });

    it('all paid plans have unlimited contacts (null)', () => {
      const paidPlans = ['pro', 'growth'] as const;
      for (const plan of paidPlans) {
        expect(PLAN_LIMITS[plan].contactsLimit).toBeNull();
      }
    });

    it('all paid plans enable all boolean features', () => {
      const paidPlans = ['pro', 'growth'] as const;
      const boolFeatures = [
        'canExportContacts',
        'canRemoveBranding',
        'canAccessAdvancedAnalytics',
        'canFilterSelfFromAnalytics',
      ] as const;

      for (const plan of paidPlans) {
        for (const feature of boolFeatures) {
          expect(PLAN_LIMITS[plan][feature]).toBe(true);
        }
      }
    });

    it('free plan disables all boolean features', () => {
      const boolFeatures = [
        'canExportContacts',
        'canRemoveBranding',
        'canAccessAdvancedAnalytics',
        'canFilterSelfFromAnalytics',
      ] as const;

      for (const feature of boolFeatures) {
        expect(PLAN_LIMITS.free[feature]).toBe(false);
      }
    });
  });
});
