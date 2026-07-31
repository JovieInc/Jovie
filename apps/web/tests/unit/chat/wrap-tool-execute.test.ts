import { tool } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  withFailSoftToolExecute,
  wrapToolSetFailSoft,
} from '@/lib/chat/wrap-tool-execute';

const { mockCaptureError, mockLogEntitlementDenial } = vi.hoisted(() => ({
  mockCaptureError: vi.fn().mockResolvedValue(undefined),
  mockLogEntitlementDenial: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/entitlements/demand-signal', () => ({
  logEntitlementDenial: mockLogEntitlementDenial,
}));

describe('wrap-tool-execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns structured failure instead of throwing', async () => {
    const execute = withFailSoftToolExecute('retouchImage', async () => {
      throw new Error('Retouch is not provisioned for this account.');
    });

    const result = await execute?.({}, {} as never);

    expect(result).toMatchObject({
      success: false,
      errorCode: 'TOOL_UNPROVISIONED',
      retryable: true,
    });
    expect(mockCaptureError).toHaveBeenCalledOnce();
  });

  it('converts TasksUpgradeRequiredError into a locked upgrade result (JOV-3861)', async () => {
    const execute = withFailSoftToolExecute('manageTasks', async () => {
      throw Object.assign(new Error('Tasks requires a Pro plan.'), {
        name: 'TasksUpgradeRequiredError',
        code: 'TASKS_WORKSPACE_LOCKED',
      });
    });

    const result = await execute?.({}, {} as never);

    expect(result).toMatchObject({
      success: true,
      locked: true,
      plan_required: expect.any(String),
      upgrade_cta: expect.stringContaining('Upgrade'),
    });
    expect(mockCaptureError).not.toHaveBeenCalled();
    expect(mockLogEntitlementDenial).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'chat-tool-throw',
        toolName: 'manageTasks',
        code: 'TASKS_WORKSPACE_LOCKED',
      })
    );
  });

  it('converts PLAN_UNAVAILABLE success:false payloads into locked results', async () => {
    const execute = withFailSoftToolExecute('generateAlbumArt', async () => ({
      success: false as const,
      error: 'Album art generation requires a Pro plan.',
      retryable: false,
      errorCode: 'PLAN_UNAVAILABLE' as const,
    }));

    const result = await execute?.({}, {} as never);

    expect(result).toMatchObject({
      success: true,
      locked: true,
    });
    expect(mockCaptureError).not.toHaveBeenCalled();
    expect(mockLogEntitlementDenial).toHaveBeenCalled();
  });

  it('normalizes success:false payloads from execute', async () => {
    const execute = withFailSoftToolExecute('generateAlbumArt', async () => ({
      success: false as const,
      error: 'Album art generation is temporarily unavailable.',
      retryable: false,
    }));

    const result = await execute?.({}, {} as never);

    expect(result).toMatchObject({
      success: false,
      errorCode: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('wraps every tool in a tool set', async () => {
    const tools = wrapToolSetFailSoft({
      demoTool: tool({
        description: 'demo',
        inputSchema: z.object({}),
        execute: async () => {
          throw new Error('demo failed');
        },
      }),
    });

    const result = await tools.demoTool.execute?.({}, {} as never);

    expect(result).toMatchObject({
      success: false,
      errorCode: 'TOOL_EXECUTION_FAILED',
    });
  });
});
