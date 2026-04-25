import { describe, expect, it } from 'vitest';
import { resolveChatUsagePlan } from '@/lib/entitlements/registry';

/**
 * resolveChatUsagePlan is the real helper used by the chat usage API route
 * (apps/web/app/api/chat/usage/route.ts) and other plan-gate callers. The
 * test previously shadowed this logic by redeclaring `resolvePlan` locally,
 * which meant any drift in the production function (new legacy alias, new
 * plan tier, case-sensitivity change) would silently pass the suite.
 * Importing the production symbol keeps the test anchored to the real
 * contract.
 */

describe('resolveChatUsagePlan', () => {
  it('maps "free" to free', () => {
    expect(resolveChatUsagePlan('free')).toBe('free');
  });

  it('maps "pro" to pro', () => {
    expect(resolveChatUsagePlan('pro')).toBe('pro');
  });

  it('maps legacy "founding" to pro', () => {
    expect(resolveChatUsagePlan('founding')).toBe('pro');
  });

  it('maps "max" to max', () => {
    expect(resolveChatUsagePlan('max')).toBe('max');
  });

  it('maps legacy "growth" to max', () => {
    expect(resolveChatUsagePlan('growth')).toBe('max');
  });

  it('maps null to free', () => {
    expect(resolveChatUsagePlan(null)).toBe('free');
  });

  it('maps undefined to free', () => {
    expect(resolveChatUsagePlan(undefined)).toBe('free');
  });

  it('maps unknown string to free', () => {
    expect(resolveChatUsagePlan('unknown')).toBe('free');
  });

  it('maps trial to free (chat usage narrows to three-tier plan)', () => {
    expect(resolveChatUsagePlan('trial')).toBe('free');
  });
});
