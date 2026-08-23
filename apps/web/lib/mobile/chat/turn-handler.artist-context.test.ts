import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatAccountContext } from '@/lib/chat/account-context';
import { getEntitlements } from '@/lib/entitlements/registry';

const hoisted = vi.hoisted(() => ({
  getSessionContext: vi.fn(),
  reserveChatTurn: vi.fn(),
  persistTerminalAssistantMessage: vi.fn(),
  markChatTurnStreaming: vi.fn(),
  resolveChatAccountContext: vi.fn(),
  checkAiChatRateLimitForPlan: vi.fn(),
  classifyIntent: vi.fn(),
  isDeterministicIntent: vi.fn(),
  executeChatTurn: vi.fn(),
  getMobileConversationDetail: vi.fn(),
  fetchReleasesForChat: vi.fn(),
  dbLimit: vi.fn(),
  handleMobileOvChatTurn: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContext,
}));

vi.mock('@/lib/chat/turns', () => ({
  reserveChatTurn: hoisted.reserveChatTurn,
  persistTerminalAssistantMessage: hoisted.persistTerminalAssistantMessage,
  markChatTurnStreaming: hoisted.markChatTurnStreaming,
  TURN_IN_PROGRESS_ERROR_CODE: 'TURN_IN_PROGRESS',
}));

vi.mock('@/lib/chat/account-context', () => ({
  resolveChatAccountContext: hoisted.resolveChatAccountContext,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAiChatRateLimitForPlan: hoisted.checkAiChatRateLimitForPlan,
}));

vi.mock('@/lib/intent-detection', () => ({
  classifyIntent: hoisted.classifyIntent,
  isDeterministicIntent: hoisted.isDeterministicIntent,
  routeIntent: vi.fn(),
}));

vi.mock('@/lib/chat/run', () => ({
  executeChatTurn: hoisted.executeChatTurn,
}));

vi.mock('@/lib/mobile/chat/conversations', () => ({
  getMobileConversationDetail: hoisted.getMobileConversationDetail,
}));

vi.mock('@/lib/mobile/chat/turn-handler-ov', () => ({
  handleMobileOvChatTurn: hoisted.handleMobileOvChatTurn,
}));

vi.mock('@/lib/chat/releases', () => ({
  fetchReleasesForChat: hoisted.fetchReleasesForChat,
}));

vi.mock('@/lib/chat/tools/merch-tools', () => ({
  createMerchGenerateTool: vi.fn(),
  createMerchPreviewTool: vi.fn(),
  createMerchSelectTool: vi.fn(),
  createMerchSourceTool: vi.fn(),
}));

vi.mock('@/lib/mobile/chat/tool-artifacts', () => ({
  embedMobileMerchArtifactsInContent: (content: string) => content,
  mobileMerchToolEventsFromResults: () => [],
}));

vi.mock('@/lib/chat/tool-events', () => ({
  decodeToolEvents: vi.fn().mockReturnValue({ events: [] }),
  resolvePersistedToolEventsForDisplay: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: hoisted.dbLimit,
        }),
      }),
    })),
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { handleMobileChatTurn } = await import('@/lib/mobile/chat/turn-handler');

const PROFILE_ID = '00000000-0000-4000-8000-000000000010';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const GENERIC_ARTIST_CONTEXT_ERROR =
  'Jovie could not load your artist context for this request. Refresh and try again.';

function makeAccountContext(): ChatAccountContext {
  const planLimits = getEntitlements('pro');
  return {
    email: 'artist@example.com',
    plan: 'pro',
    displayPlan: 'Pro',
    isPro: true,
    billingVerification: 'verified',
    planMismatch: null,
    usage: null,
    entitlements: {
      aiCanUseTools: planLimits.booleans.aiCanUseTools,
      canAccessMerchCreation: false,
      canGenerateAlbumArt: planLimits.booleans.canGenerateAlbumArt,
      canAccessAdvancedAnalytics:
        planLimits.booleans.canAccessAdvancedAnalytics,
    },
    flags: { merchMvp: false },
    billing: {
      hasStripeCustomer: true,
      hasStripeSubscription: true,
    },
    merchAccess: { available: false, reason: 'plan_unavailable' },
    planLimits,
    userEntitlements: {
      userId: USER_ID,
      email: 'artist@example.com',
      isAuthenticated: true,
      isAdmin: false,
      plan: 'pro',
      isPro: true,
      hasAdvancedFeatures: false,
      isTrialing: false,
      trialEndsAt: null,
      trialDaysRemaining: null,
      billingVerification: 'verified',
      hasStripeCustomer: true,
      hasStripeSubscription: true,
      ...planLimits.booleans,
      ...planLimits.limits,
    },
  };
}

describe('handleMobileChatTurn artist-context seam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.dbLimit.mockResolvedValue([]);
    hoisted.getSessionContext.mockResolvedValue({
      clerkUserId: USER_ID,
      user: { id: USER_ID },
      profile: {
        id: PROFILE_ID,
        userId: USER_ID,
        username: 'tim',
        usernameNormalized: 'tim',
        displayName: 'Tim White',
        avatarUrl: null,
        isPublic: true,
        isClaimed: true,
        onboardingCompletedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    hoisted.reserveChatTurn.mockResolvedValue({
      outcome: 'reserved',
      conversationId: 'conv_1',
      turn: { id: 'turn_1' },
    });
    hoisted.resolveChatAccountContext.mockResolvedValue(makeAccountContext());
    hoisted.checkAiChatRateLimitForPlan.mockResolvedValue({ success: true });
    hoisted.classifyIntent.mockReturnValue({ category: 'unknown' });
    hoisted.isDeterministicIntent.mockReturnValue(false);
    hoisted.getMobileConversationDetail.mockResolvedValue({
      messages: [],
    });
    hoisted.fetchReleasesForChat.mockResolvedValue([]);
    hoisted.executeChatTurn.mockResolvedValue({
      streamResult: {
        textStream: (async function* () {
          yield 'Here is a real reply.';
        })(),
        toolResults: Promise.resolve([]),
      },
    });
  });

  it('streams a model reply when the extra artist-context lookup misses', async () => {
    const response = await handleMobileChatTurn(
      USER_ID,
      {
        clientTurnId: 'client_turn_1',
        clientMessageId: 'client_msg_1',
        text: 'What should I post this week?',
        source: 'typed',
        chatMode: null,
      },
      new AbortController().signal
    );

    expect(response.status).toBe(200);
    expect(hoisted.executeChatTurn).toHaveBeenCalledTimes(1);
    expect(hoisted.executeChatTurn.mock.calls[0]?.[0]).toMatchObject({
      artistContext: {
        displayName: 'Tim White',
        username: 'tim',
      },
      resolvedProfileId: PROFILE_ID,
    });
    expect(hoisted.persistTerminalAssistantMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'ARTIST_CONTEXT_UNAVAILABLE',
      })
    );

    const body = await response.text();
    expect(body).not.toContain(GENERIC_ARTIST_CONTEXT_ERROR);
    expect(body).toContain('Here is a real reply.');
    expect(hoisted.handleMobileOvChatTurn).not.toHaveBeenCalled();
  });

  it('routes ov chatMode to Summer/ops and never runs artist Jovie generation', async () => {
    const ovResponse = new Response('{"type":"assistant.completed"}\n', {
      status: 200,
    });
    hoisted.handleMobileOvChatTurn.mockResolvedValue(ovResponse);

    const response = await handleMobileChatTurn(
      USER_ID,
      {
        clientTurnId: 'client_turn_ov',
        clientMessageId: 'client_msg_ov',
        text: 'What stills need a taste decision?',
        source: 'typed',
        chatMode: 'ov',
      },
      new AbortController().signal
    );

    expect(response).toBe(ovResponse);
    expect(hoisted.handleMobileOvChatTurn).toHaveBeenCalledTimes(1);
    expect(hoisted.executeChatTurn).not.toHaveBeenCalled();
    expect(hoisted.reserveChatTurn).not.toHaveBeenCalled();
  });
});
