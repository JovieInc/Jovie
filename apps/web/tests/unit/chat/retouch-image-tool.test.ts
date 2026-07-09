import { beforeEach, describe, expect, it, vi } from 'vitest';

const isRetouchConfiguredMock = vi.fn(() => true);
const executeRetouchMock = vi.fn();

vi.mock('@/lib/services/retouching/provider-gemini', () => ({
  isRetouchConfigured: () => isRetouchConfiguredMock(),
}));

vi.mock('@/lib/services/retouching/executor', () => ({
  executeRetouch: (...args: unknown[]) => executeRetouchMock(...args),
}));

import { createRetouchImageTool } from '@/lib/chat/tools/retouch-image';

type Entitlements = Awaited<
  ReturnType<
    typeof import('@/lib/entitlements/server').getCurrentUserEntitlements
  >
>;

function buildTool(overrides?: {
  readonly profileId?: string | null;
  readonly canAccessAiRetouching?: boolean;
  readonly aiRetouchDailyLimit?: number | null;
  readonly sourceImageUrl?: string | null;
}) {
  return createRetouchImageTool({
    profileId:
      overrides?.profileId === undefined ? 'profile_123' : overrides.profileId,
    entitlements: {
      canAccessAiRetouching: overrides?.canAccessAiRetouching ?? true,
      aiRetouchDailyLimit:
        overrides?.aiRetouchDailyLimit === undefined
          ? 10
          : overrides.aiRetouchDailyLimit,
    } as Entitlements,
    clerkUserId: 'clerk_user_1',
    sourceImageUrl:
      overrides?.sourceImageUrl === undefined
        ? 'https://blob.example.com/photo.jpg'
        : overrides.sourceImageUrl,
    conversationId: 'conv_1',
  });
}

describe('createRetouchImageTool', () => {
  beforeEach(() => {
    isRetouchConfiguredMock.mockReset().mockReturnValue(true);
    executeRetouchMock.mockReset();
  });

  it('returns structured unprovisioned failure when the provider is not configured', async () => {
    isRetouchConfiguredMock.mockReturnValue(false);

    const tool = buildTool();
    const result = await tool.execute?.({}, {} as never);

    expect(result).toMatchObject({
      success: false,
      errorCode: 'TOOL_UNPROVISIONED',
      error: 'Retouch is not provisioned for this account.',
      retryable: true,
    });
    expect(executeRetouchMock).not.toHaveBeenCalled();
  });

  it('returns plan-unavailable failure for free-tier entitlements', async () => {
    const tool = buildTool({ canAccessAiRetouching: false });
    const result = await tool.execute?.({}, {} as never);

    expect(result).toMatchObject({
      success: false,
      errorCode: 'PLAN_UNAVAILABLE',
      retryable: false,
    });
    expect(executeRetouchMock).not.toHaveBeenCalled();
  });

  it('returns a structured no-image failure when no attachment is present', async () => {
    const tool = buildTool({ sourceImageUrl: null });
    const result = await tool.execute?.({}, {} as never);

    expect(result).toMatchObject({
      success: false,
      errorCode: 'NO_IMAGE_ATTACHED',
      retryable: true,
    });
    expect(executeRetouchMock).not.toHaveBeenCalled();
  });

  it('runs the executor and returns the retouched result payload', async () => {
    executeRetouchMock.mockResolvedValue({
      success: true,
      jobId: 'job_1',
      styleId: 'white-space',
      resultUrl: 'https://blob.example.com/retouch/result.png',
      sourceImageUrl: 'https://blob.example.com/photo.jpg',
    });

    const tool = buildTool();
    const result = await tool.execute?.(
      { instructions: '  brighten slightly ' },
      {} as never
    );

    expect(executeRetouchMock).toHaveBeenCalledWith({
      clerkUserId: 'clerk_user_1',
      sourceImageUrl: 'https://blob.example.com/photo.jpg',
      instructions: 'brighten slightly',
      conversationId: 'conv_1',
      dailyLimit: 10,
    });
    expect(result).toMatchObject({
      success: true,
      state: 'retouched',
      jobId: 'job_1',
      styleId: 'white-space',
      resultUrl: 'https://blob.example.com/retouch/result.png',
    });
  });

  it('passes structured executor failures through untouched', async () => {
    executeRetouchMock.mockResolvedValue({
      success: false,
      errorCode: 'DAILY_LIMIT_REACHED',
      error: "You've used all 10 retouches for today.",
      retryable: false,
    });

    const tool = buildTool();
    const result = await tool.execute?.({}, {} as never);

    expect(result).toMatchObject({
      success: false,
      errorCode: 'DAILY_LIMIT_REACHED',
      retryable: false,
    });
  });
});
