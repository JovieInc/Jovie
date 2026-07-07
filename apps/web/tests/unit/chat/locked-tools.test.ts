/**
 * Entitlement-locked chat tool stubs (GH #13304).
 *
 * Locked stubs keep gated tools visible to the model and return a
 * success-shaped `{ locked: true, reason, plan_required, upgrade_cta }`
 * payload sourced from the entitlement registry — never an error.
 */

import { describe, expect, it } from 'vitest';
import {
  buildLockedToolPromptInfo,
  buildLockedToolResult,
  buildLockedToolSet,
  createLockedToolStub,
  isLockedToolOutput,
  LOCKABLE_CHAT_TOOL_GATES,
  type LockableChatToolName,
  resolveLockedChatTools,
  resolveRequiredPlanForGate,
} from '@/lib/chat/locked-tools';
import { normalizeToolFailureOutput } from '@/lib/chat/tool-errors';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';

const LOCKABLE_NAMES = Object.keys(
  LOCKABLE_CHAT_TOOL_GATES
) as LockableChatToolName[];

describe('resolveRequiredPlanForGate', () => {
  it('resolves Pro for gates Pro grants', () => {
    expect(resolveRequiredPlanForGate('canGenerateAlbumArt')).toEqual({
      planId: 'pro',
      displayName: ENTITLEMENT_REGISTRY.pro.marketing.displayName,
    });
    expect(resolveRequiredPlanForGate('canAccessMerchCreation').planId).toBe(
      'pro'
    );
  });

  it('resolves Max for gates only Max grants', () => {
    expect(resolveRequiredPlanForGate('canGenerateReleasePlans').planId).toBe(
      'max'
    );
  });
});

describe('buildLockedToolResult', () => {
  it('is success-shaped with locked flag so the turn never errors', () => {
    for (const name of LOCKABLE_NAMES) {
      const result = buildLockedToolResult(name);
      expect(result.success).toBe(true);
      expect(result.locked).toBe(true);
      expect(normalizeToolFailureOutput(name, result)).toBeNull();
    }
  });

  it('names the exact registry gate and required plan in the lock copy', () => {
    const result = buildLockedToolResult('generateAlbumArt');
    expect(result.gate).toBe('canGenerateAlbumArt');
    expect(result.plan_required).toBe(
      ENTITLEMENT_REGISTRY.pro.marketing.displayName
    );
    expect(result.reason).toContain('canGenerateAlbumArt');
    expect(result.reason).toContain('Pro');
    expect(result.upgrade_cta).toContain('Pro');
    expect(result.summary).toContain('Pro');
  });
});

describe('createLockedToolStub', () => {
  it('returns the locked payload from execute', async () => {
    const stub = createLockedToolStub('retouchImage') as {
      execute?: (input: unknown, options: unknown) => Promise<unknown>;
      description?: string;
    };
    expect(typeof stub.execute).toBe('function');
    expect(stub.description).toBeTypeOf('string');

    const output = await stub.execute?.({}, {});
    expect(isLockedToolOutput(output as Record<string, unknown>)).toBe(true);
    expect((output as { plan_required: string }).plan_required).toBe(
      ENTITLEMENT_REGISTRY.pro.marketing.displayName
    );
  });
});

describe('resolveLockedChatTools', () => {
  it('locks all gated generative tools on the free plan', () => {
    const locked = resolveLockedChatTools(ENTITLEMENT_REGISTRY.free.booleans);
    expect(locked).toEqual(
      expect.arrayContaining([
        'generateAlbumArt',
        'retouchImage',
        'createMerch',
        'previewMerchOptions',
      ])
    );
    expect(locked).toHaveLength(LOCKABLE_NAMES.length);
  });

  it('locks nothing on pro/max/trial plans', () => {
    for (const plan of ['pro', 'max', 'trial'] as const) {
      expect(
        resolveLockedChatTools(ENTITLEMENT_REGISTRY[plan].booleans)
      ).toEqual([]);
    }
  });
});

describe('buildLockedToolSet / buildLockedToolPromptInfo', () => {
  it('builds one stub and one prompt entry per locked tool', () => {
    const names = resolveLockedChatTools(ENTITLEMENT_REGISTRY.free.booleans);
    const toolSet = buildLockedToolSet(names);
    expect(Object.keys(toolSet).sort()).toEqual([...names].sort());

    const promptInfo = buildLockedToolPromptInfo(names);
    expect(promptInfo).toHaveLength(names.length);
    for (const entry of promptInfo) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.planRequired).toBe(
        ENTITLEMENT_REGISTRY.pro.marketing.displayName
      );
    }
  });
});

describe('isLockedToolOutput', () => {
  it('detects only locked payloads', () => {
    expect(isLockedToolOutput(buildLockedToolResult('createMerch'))).toBe(true);
    expect(isLockedToolOutput({ success: true })).toBe(false);
    expect(isLockedToolOutput(undefined)).toBe(false);
  });
});
