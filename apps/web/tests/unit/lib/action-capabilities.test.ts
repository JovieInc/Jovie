import { describe, expect, it } from 'vitest';

import { resolveActionCapabilities } from '@/lib/actions/capabilities';
import type { UserEntitlements } from '@/types';

function makeEntitlements(
  overrides: Partial<UserEntitlements> = {}
): UserEntitlements {
  return {
    isAuthenticated: true,
    billingVerification: 'verified',
    canCreateManualReleases: true,
    canAccessTasksWorkspace: true,
    contactsLimit: null,
    ...overrides,
  } as unknown as UserEntitlements;
}

describe('resolveActionCapabilities', () => {
  it('marks every action available on a supported channel for a full-access user', () => {
    const result = resolveActionCapabilities({
      entitlements: makeEntitlements(),
      channel: 'web',
      profileOwned: true,
    });

    expect(result).toHaveLength(4);
    for (const capability of result) {
      expect(capability.available).toBe(true);
      expect(capability.visibility).toBe('visible');
      expect(capability.reasonCode).toBeUndefined();
    }
  });

  it('hides actions on channels they do not support', () => {
    const result = resolveActionCapabilities({
      entitlements: makeEntitlements(),
      channel: 'widget',
      profileOwned: true,
    });

    const chatStart = result.find(c => c.action.id === 'chat.start');
    const taskCreate = result.find(c => c.action.id === 'task.create');
    expect(chatStart?.visibility).toBe('visible');
    expect(taskCreate?.visibility).toBe('hidden');
    expect(taskCreate?.available).toBe(false);
  });

  it('returns AUTH_REQUIRED for unauthenticated callers', () => {
    const result = resolveActionCapabilities({
      entitlements: makeEntitlements({ isAuthenticated: false }),
      channel: 'web',
      profileOwned: false,
    });

    for (const capability of result) {
      expect(capability.available).toBe(false);
      expect(capability.reasonCode).toBe('AUTH_REQUIRED');
      expect(capability.retryable).toBe(false);
    }
  });

  it('returns FORBIDDEN when the profile scope is not owned', () => {
    const result = resolveActionCapabilities({
      entitlements: makeEntitlements(),
      channel: 'web',
      profileOwned: false,
    });

    const taskCreate = result.find(c => c.action.id === 'task.create');
    expect(taskCreate?.available).toBe(false);
    expect(taskCreate?.reasonCode).toBe('FORBIDDEN');
  });

  it('returns ENTITLEMENT_REQUIRED with an upgrade for a missing boolean entitlement', () => {
    const result = resolveActionCapabilities({
      entitlements: makeEntitlements({ canAccessTasksWorkspace: false }),
      channel: 'web',
      profileOwned: true,
    });

    const taskCreate = result.find(c => c.action.id === 'task.create');
    expect(taskCreate?.available).toBe(false);
    expect(taskCreate?.reasonCode).toBe('ENTITLEMENT_REQUIRED');
    expect(taskCreate?.upgrade?.eligible).toBe(true);
  });

  it('preserves degraded billing as ENTITLEMENT_UNVERIFIED instead of widening access', () => {
    const result = resolveActionCapabilities({
      entitlements: makeEntitlements({
        billingVerification: 'unavailable',
        canAccessTasksWorkspace: false,
      }),
      channel: 'web',
      profileOwned: true,
    });

    const taskCreate = result.find(c => c.action.id === 'task.create');
    expect(taskCreate?.available).toBe(false);
    expect(taskCreate?.reasonCode).toBe('ENTITLEMENT_UNVERIFIED');
    expect(taskCreate?.retryable).toBe(true);
  });

  it('evaluates numeric entitlement quotas against usage', () => {
    const result = resolveActionCapabilities({
      entitlements: makeEntitlements({ contactsLimit: 100 }),
      channel: 'web',
      profileOwned: true,
      quotaUsage: { contactsLimit: 100 },
    });

    const contactCreate = result.find(c => c.action.id === 'contact.create');
    expect(contactCreate?.available).toBe(false);
    expect(contactCreate?.reasonCode).toBe('QUOTA_EXHAUSTED');
    expect(contactCreate?.quota).toEqual({ used: 100, limit: 100 });
  });

  it('descriptor payloads carry JSON schemas and stable identity', () => {
    const result = resolveActionCapabilities({
      entitlements: makeEntitlements(),
      channel: 'web',
      profileOwned: true,
    });

    const chatStart = result.find(c => c.action.id === 'chat.start');
    expect(chatStart?.action.schemaVersion).toBe(1);
    expect(chatStart?.action.effect).toBe('navigation');
    expect(chatStart?.action.inputSchema).toMatchObject({ type: 'object' });
    expect(chatStart?.action.titleKey).toBe('actions.chat.start.title');
  });
});
