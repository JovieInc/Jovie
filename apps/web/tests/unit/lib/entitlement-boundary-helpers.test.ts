import { describe, expect, it } from 'vitest';
import {
  checkBoolean,
  ENTITLEMENT_REGISTRY,
  getEntitlements,
  getLimit,
  hasAdvancedFeatures,
  isProPlan,
} from '@/lib/entitlements/registry';

describe('entitlement registry boundary helpers', () => {
  it('falls back to free entitlements for nullish and unknown plans', () => {
    expect(getEntitlements(null)).toBe(ENTITLEMENT_REGISTRY.free);
    expect(getEntitlements(undefined)).toBe(ENTITLEMENT_REGISTRY.free);
    expect(getEntitlements('')).toBe(ENTITLEMENT_REGISTRY.free);
    expect(getEntitlements('enterprise')).toBe(ENTITLEMENT_REGISTRY.free);
  });

  it('returns expected boolean gates for known plans and false for unknown plans', () => {
    expect(checkBoolean('free', 'canExportContacts')).toBe(false);
    expect(checkBoolean('pro', 'canExportContacts')).toBe(true);
    expect(checkBoolean('max', 'canExportContacts')).toBe(true);
    expect(checkBoolean('not-a-plan', 'canExportContacts')).toBe(false);
  });

  it('returns expected limits for known plans and free defaults for unknown plans', () => {
    expect(getLimit('free', 'analyticsRetentionDays')).toBe(30);
    expect(getLimit('pro', 'analyticsRetentionDays')).toBe(180);
    expect(getLimit('max', 'analyticsRetentionDays')).toBeNull();

    expect(getLimit('free', 'contactsLimit')).toBe(100);
    expect(getLimit('pro', 'contactsLimit')).toBe(5000);
    expect(getLimit('max', 'contactsLimit')).toBeNull();

    expect(getLimit('free', 'smartLinksLimit')).toBeNull();

    expect(getLimit('mystery', 'analyticsRetentionDays')).toBe(30);
    expect(getLimit('mystery', 'contactsLimit')).toBe(100);
  });

  it('keeps plan classifier helpers strict and predictable', () => {
    expect(isProPlan('free')).toBe(false);
    expect(isProPlan('pro')).toBe(true);
    expect(isProPlan('max')).toBe(true);
    expect(isProPlan('enterprise')).toBe(false);

    expect(hasAdvancedFeatures('free')).toBe(false);
    expect(hasAdvancedFeatures('pro')).toBe(false);
    expect(hasAdvancedFeatures('max')).toBe(true);
    expect(hasAdvancedFeatures('enterprise')).toBe(false);
  });
});
