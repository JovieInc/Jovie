import { describe, expect, it } from 'vitest';
import {
  ENTITLEMENT_REGISTRY,
  getEntitlements,
  getPlanDisplayName,
  hasAdvancedFeatures,
  isProPlan,
  isValidPlanId,
  resolveCanonicalPlanId,
} from '@/lib/entitlements/registry';

describe('Plan Configuration (Entitlement Registry)', () => {
  describe('ENTITLEMENT_REGISTRY', () => {
    it('free plan has correct limits', () => {
      const free = ENTITLEMENT_REGISTRY.free;
      expect(free.limits).toEqual({
        analyticsRetentionDays: 30,
        contactsLimit: 100,
        smartLinksLimit: null,
        aiDailyMessageLimit: 10,
        aiPitchGenPerRelease: 1,
      });
      expect(free.booleans).toEqual({
        canExportContacts: false,
        canAccessAdvancedAnalytics: false,
        canFilterSelfFromAnalytics: false,
        canAccessAdPixels: false,
        canAccessInbox: false,
        canBeVerified: false,
        aiCanUseTools: true,
        canCreateManualReleases: true,
        canAccessTasksWorkspace: false,
        canGenerateReleasePlans: false,
        canGenerateAlbumArt: false,
        canAccessMetadataSubmissionAgent: false,
        canAccessFutureReleases: false,
        canSendNotifications: false,
        canEditSmartLinks: true,
        canAccessPreSave: false,
        canAccessTipping: false,
        canAccessUrlEncryption: false,
        canAccessStripeConnect: false,
        canAccessFanSubscriptions: false,
        canAccessEmailCampaigns: false,
        canAccessApiKeys: false,
        canAccessTeamManagement: false,
        canAccessWebhooks: false,
        canAccessWhiteLabel: false,
        canAccessAbTesting: false,
      });
    });

    it('pro plan has correct limits', () => {
      const pro = ENTITLEMENT_REGISTRY.pro;
      expect(pro.limits).toEqual({
        analyticsRetentionDays: 180,
        contactsLimit: null,
        smartLinksLimit: null,
        aiDailyMessageLimit: 100,
        aiPitchGenPerRelease: 5,
      });
      expect(pro.booleans).toEqual({
        canExportContacts: true,
        canAccessAdvancedAnalytics: true,
        canFilterSelfFromAnalytics: true,
        canAccessAdPixels: true,
        canAccessInbox: true,
        canBeVerified: true,
        aiCanUseTools: true,
        canCreateManualReleases: true,
        canAccessTasksWorkspace: true,
        canGenerateReleasePlans: false,
        canGenerateAlbumArt: true,
        canAccessMetadataSubmissionAgent: false,
        canAccessFutureReleases: true,
        canSendNotifications: true,
        canEditSmartLinks: true,
        canAccessPreSave: true,
        canAccessTipping: true,
        canAccessUrlEncryption: true,
        canAccessStripeConnect: false,
        canAccessFanSubscriptions: false,
        canAccessEmailCampaigns: false,
        canAccessApiKeys: false,
        canAccessTeamManagement: false,
        canAccessWebhooks: false,
        canAccessWhiteLabel: false,
        canAccessAbTesting: false,
      });
    });

    it('max plan has correct limits', () => {
      const max = ENTITLEMENT_REGISTRY.max;
      expect(max.limits).toEqual({
        analyticsRetentionDays: null,
        contactsLimit: null,
        smartLinksLimit: null,
        aiDailyMessageLimit: 500,
        aiPitchGenPerRelease: null,
      });
      expect(max.booleans).toEqual({
        canExportContacts: true,
        canAccessAdvancedAnalytics: true,
        canFilterSelfFromAnalytics: true,
        canAccessAdPixels: true,
        canAccessInbox: true,
        canBeVerified: true,
        aiCanUseTools: true,
        canCreateManualReleases: true,
        canAccessTasksWorkspace: true,
        canGenerateReleasePlans: true,
        canGenerateAlbumArt: true,
        canAccessMetadataSubmissionAgent: true,
        canAccessFutureReleases: true,
        canSendNotifications: true,
        canEditSmartLinks: true,
        canAccessPreSave: true,
        canAccessTipping: true,
        canAccessUrlEncryption: true,
        canAccessStripeConnect: true,
        canAccessFanSubscriptions: true,
        canAccessEmailCampaigns: true,
        canAccessApiKeys: true,
        canAccessTeamManagement: true,
        canAccessWebhooks: true,
        canAccessWhiteLabel: true,
        canAccessAbTesting: true,
      });
    });

    it('free plan contacts limit is exactly 100', () => {
      expect(ENTITLEMENT_REGISTRY.free.limits.contactsLimit).toBe(100);
    });

    it('pro has unlimited contacts and max has unlimited contacts (null)', () => {
      expect(ENTITLEMENT_REGISTRY.pro.limits.contactsLimit).toBeNull();
      expect(ENTITLEMENT_REGISTRY.max.limits.contactsLimit).toBeNull();
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

    it('returns max entitlements for "max" plan', () => {
      expect(getEntitlements('max')).toEqual(ENTITLEMENT_REGISTRY.max);
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

    it('returns true for "max"', () => {
      expect(isProPlan('max')).toBe(true);
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

    it('returns true only for "max"', () => {
      expect(hasAdvancedFeatures('max')).toBe(true);
    });
  });

  describe('getPlanDisplayName', () => {
    it('returns "Free" for null', () => {
      expect(getPlanDisplayName(null)).toBe('Free');
    });

    it('returns correct display names', () => {
      expect(getPlanDisplayName('free')).toBe('Free');
      expect(getPlanDisplayName('pro')).toBe('Pro');
      expect(getPlanDisplayName('max')).toBe('Max');
    });

    it('returns "Free" for unknown plan strings', () => {
      expect(getPlanDisplayName('enterprise')).toBe('Free');
      expect(getPlanDisplayName('')).toBe('Free');
      expect(getPlanDisplayName('MAX')).toBe('Free');
    });
  });

  describe('plan id validation helpers', () => {
    it('accepts legacy aliases and resolves them to canonical plans', () => {
      expect(isValidPlanId('founding')).toBe(true);
      expect(isValidPlanId('growth')).toBe(true);
      expect(resolveCanonicalPlanId('founding')).toBe('pro');
      expect(resolveCanonicalPlanId('growth')).toBe('max');
    });

    it('rejects inherited prototype properties', () => {
      expect(isValidPlanId('toString')).toBe(false);
      expect(isValidPlanId('__proto__')).toBe(false);
      expect(resolveCanonicalPlanId('constructor')).toBeNull();
      expect(resolveCanonicalPlanId('toString')).toBeNull();
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
      expect(isProPlan('Max')).toBe(false);
      expect(isProPlan('MAX')).toBe(false);
    });

    it('isProPlan rejects empty string', () => {
      expect(isProPlan('')).toBe(false);
    });

    it('hasAdvancedFeatures rejects case-mismatched max', () => {
      expect(hasAdvancedFeatures('Max')).toBe(false);
      expect(hasAdvancedFeatures('MAX')).toBe(false);
    });

    it('plan hierarchy: max > pro > free for retention days', () => {
      // max has null (unlimited), pro has 180, free has 30
      expect(ENTITLEMENT_REGISTRY.max.limits.analyticsRetentionDays).toBeNull();
      expect(
        ENTITLEMENT_REGISTRY.pro.limits.analyticsRetentionDays
      ).toBeGreaterThan(
        ENTITLEMENT_REGISTRY.free.limits.analyticsRetentionDays!
      );
    });

    it('max and pro plans have unlimited contacts (null)', () => {
      expect(ENTITLEMENT_REGISTRY.max.limits.contactsLimit).toBeNull();
      expect(ENTITLEMENT_REGISTRY.pro.limits.contactsLimit).toBeNull();
    });

    it('max plan enables all boolean features', () => {
      const paidPlans = ['max'] as const;
      for (const plan of paidPlans) {
        for (const [, value] of Object.entries(
          ENTITLEMENT_REGISTRY[plan].booleans
        )) {
          expect(value).toBe(true);
        }
      }
    });

    it('free plan has expected boolean feature mix', () => {
      const booleans = ENTITLEMENT_REGISTRY.free.booleans;
      // Pro-only features stay false
      expect(booleans.canExportContacts).toBe(false);
      expect(booleans.canAccessAdvancedAnalytics).toBe(false);
      expect(booleans.canFilterSelfFromAnalytics).toBe(false);
      expect(booleans.canAccessAdPixels).toBe(false);
      expect(booleans.canBeVerified).toBe(false);
      expect(booleans.canAccessFutureReleases).toBe(false);
      // Unlocked for free
      expect(booleans.aiCanUseTools).toBe(true);
      expect(booleans.canCreateManualReleases).toBe(true);
      expect(booleans.canSendNotifications).toBe(false);
      expect(booleans.canEditSmartLinks).toBe(true);
    });
  });
});
