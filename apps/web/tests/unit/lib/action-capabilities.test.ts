import type { ActionDescriptor } from '@jovie/action-contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

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

describe('resolveActionCapabilities client-version gate', () => {
  function makeDescriptor(
    overrides: Partial<ActionDescriptor> = {}
  ): ActionDescriptor {
    return {
      id: 'task.create',
      schemaVersion: 1,
      titleKey: 'actions.task.create.title',
      descriptionKey: 'actions.task.create.description',
      effect: 'internal_write',
      confirmation: 'none',
      supportedChannels: ['web', 'ios'],
      requirements: [{ type: 'auth' }],
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      ...overrides,
    };
  }

  const gatedDescriptor = makeDescriptor({
    minimumClientVersions: { ios: '2.1.0' },
  });

  function resolveGated(clientVersion?: string) {
    return resolveActionCapabilities({
      entitlements: makeEntitlements(),
      channel: 'ios',
      profileOwned: true,
      clientVersion,
      manifest: [gatedDescriptor],
    })[0];
  }

  it('returns CLIENT_UPGRADE_REQUIRED below the declared channel minimum', () => {
    const capability = resolveGated('2.0.9');
    expect(capability.available).toBe(false);
    expect(capability.visibility).toBe('visible');
    expect(capability.reasonCode).toBe('CLIENT_UPGRADE_REQUIRED');
    expect(capability.retryable).toBe(false);
  });

  it('fails closed when the client omits its version', () => {
    const capability = resolveGated(undefined);
    expect(capability.available).toBe(false);
    expect(capability.reasonCode).toBe('CLIENT_UPGRADE_REQUIRED');
  });

  it('is available at the exact minimum boundary', () => {
    const capability = resolveGated('2.1.0');
    expect(capability.available).toBe(true);
    expect(capability.reasonCode).toBeUndefined();
  });

  it('is available above the declared minimum', () => {
    const capability = resolveGated('3.0.0');
    expect(capability.available).toBe(true);
  });

  it('does not gate channels without a declared minimum', () => {
    const [capability] = resolveActionCapabilities({
      entitlements: makeEntitlements(),
      channel: 'web',
      profileOwned: true,
      manifest: [gatedDescriptor],
    });
    expect(capability.available).toBe(true);
  });

  it('lets CLIENT_UPGRADE_REQUIRED take precedence over requirement failures', () => {
    const [capability] = resolveActionCapabilities({
      entitlements: makeEntitlements({ isAuthenticated: false }),
      channel: 'ios',
      profileOwned: false,
      clientVersion: '2.0.0',
      manifest: [gatedDescriptor],
    });
    expect(capability.available).toBe(false);
    expect(capability.reasonCode).toBe('CLIENT_UPGRADE_REQUIRED');
  });
});
