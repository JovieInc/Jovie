import { describe, expect, it } from 'vitest';
import { createRetouchImageTool } from '@/lib/chat/tools/retouch-image';

describe('createRetouchImageTool', () => {
  it('returns structured unprovisioned failure instead of throwing', async () => {
    const tool = createRetouchImageTool({
      profileId: 'profile_123',
      entitlements: {
        canAccessAiRetouching: true,
      } as Awaited<
        ReturnType<
          typeof import('@/lib/entitlements/server').getCurrentUserEntitlements
        >
      >,
    });

    const result = await tool.execute?.({}, {} as never);

    expect(result).toMatchObject({
      success: false,
      errorCode: 'TOOL_UNPROVISIONED',
      error: 'Retouch is not provisioned for this account.',
      retryable: true,
    });
  });

  it('returns plan-unavailable failure for free-tier entitlements', async () => {
    const tool = createRetouchImageTool({
      profileId: 'profile_123',
      entitlements: {
        canAccessAiRetouching: false,
      } as Awaited<
        ReturnType<
          typeof import('@/lib/entitlements/server').getCurrentUserEntitlements
        >
      >,
    });

    const result = await tool.execute?.({}, {} as never);

    expect(result).toMatchObject({
      success: false,
      errorCode: 'PLAN_UNAVAILABLE',
      retryable: false,
    });
  });
});
