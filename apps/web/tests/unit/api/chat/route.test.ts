import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getOptionalAuthMock: vi.fn(),
  getUserBillingInfoMock: vi.fn(),
  checkGateForUserMock: vi.fn(),
  getCurrentUserEntitlementsMock: vi.fn(),
  checkAiChatRateLimitForPlanMock: vi.fn(),
  buildFreeChatToolsMock: vi.fn(),
  buildChatToolsMock: vi.fn(),
  fetchReleasesForChatMock: vi.fn(),
  selectKnowledgeContextMock: vi.fn(),
  buildSystemPromptMock: vi.fn(),
  convertToModelMessagesMock: vi.fn(),
  streamTextMock: vi.fn(),
  gatewayMock: vi.fn(),
  createAuthenticatedCorsHeadersMock: vi.fn(),
  setTagMock: vi.fn(),
  setTagsMock: vi.fn(),
  setExtraMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getOptionalAuth: hoisted.getOptionalAuthMock,
}));

vi.mock('@/lib/stripe/customer-sync/billing-info', () => ({
  getUserBillingInfo: hoisted.getUserBillingInfoMock,
}));

vi.mock('@/lib/flags/server', () => ({
  checkGateForUser: hoisted.checkGateForUserMock,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlementsMock,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAiChatRateLimitForPlan: hoisted.checkAiChatRateLimitForPlanMock,
  createRateLimitHeaders: vi.fn(() => ({})),
}));

vi.mock('@/lib/chat/tools/builders', () => ({
  buildFreeChatTools: hoisted.buildFreeChatToolsMock,
  buildChatTools: hoisted.buildChatToolsMock,
}));

vi.mock('@/lib/chat/tools/shared', () => ({
  fetchReleasesForChat: hoisted.fetchReleasesForChatMock,
}));

vi.mock('@/lib/chat/knowledge/router', () => ({
  selectKnowledgeContext: hoisted.selectKnowledgeContextMock,
}));

vi.mock('@/lib/chat/system-prompt', () => ({
  buildSystemPrompt: hoisted.buildSystemPromptMock,
}));

vi.mock('@/lib/entitlements/registry', () => ({
  getEntitlements: vi.fn(() => ({
    booleans: { aiCanUseTools: true },
    limits: { aiDailyMessageLimit: 100 },
  })),
}));

vi.mock('@ai-sdk/gateway', () => ({
  gateway: hoisted.gatewayMock,
}));

vi.mock('ai', () => ({
  convertToModelMessages: hoisted.convertToModelMessagesMock,
  createUIMessageStream: vi.fn(),
  createUIMessageStreamResponse: vi.fn(),
  streamText: hoisted.streamTextMock,
}));

vi.mock('@/lib/http/headers', () => ({
  createAuthenticatedCorsHeaders: hoisted.createAuthenticatedCorsHeadersMock,
}));

vi.mock('@sentry/nextjs', () => ({
  setTag: hoisted.setTagMock,
  setTags: hoisted.setTagsMock,
  setExtra: hoisted.setExtraMock,
  captureException: hoisted.captureExceptionMock,
}));

vi.mock('@/lib/constants/ai-models', () => ({
  CHAT_MODEL: 'chat-model',
  CHAT_MODEL_LIGHT: 'chat-model-light',
}));

vi.mock('@/lib/feature-flags/shared', () => ({
  FEATURE_FLAGS: {
    ALBUM_ART_GENERATION: true,
  },
}));

vi.mock('@/lib/intent-detection', () => ({
  classifyIntent: vi.fn(() => ({ category: 'general' })),
  isDeterministicIntent: vi.fn(() => false),
  routeIntent: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {},
}));

vi.mock('@/lib/db/schema/analytics', () => ({
  clickEvents: {},
  tips: {},
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {},
}));

vi.mock('@/lib/db/schema/links', () => ({
  socialLinks: {},
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {},
}));

vi.mock('@/lib/db/sql-helpers', () => ({
  sqlAny: vi.fn(),
}));

vi.mock('@/lib/services/social-links/types', () => ({
  DSP_PLATFORMS: [],
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  count: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(),
}));

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.getOptionalAuthMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.getUserBillingInfoMock.mockResolvedValue({
      data: { plan: 'pro' },
    });
    hoisted.checkGateForUserMock.mockResolvedValue(false);
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      isPro: true,
      canGenerateAlbumArt: true,
    });
    hoisted.checkAiChatRateLimitForPlanMock.mockResolvedValue({
      success: true,
    });
    hoisted.fetchReleasesForChatMock.mockResolvedValue([]);
    hoisted.selectKnowledgeContextMock.mockReturnValue(null);
    hoisted.buildSystemPromptMock.mockReturnValue('system prompt');
    hoisted.convertToModelMessagesMock.mockResolvedValue([
      { role: 'user', content: 'Generate album art' },
    ]);
    hoisted.buildFreeChatToolsMock.mockReturnValue({
      proposeAvatarUpload: { type: 'free' },
    });
    hoisted.buildChatToolsMock.mockReturnValue({
      generateAlbumArt: { type: 'paid' },
      createRelease: { type: 'paid' },
      generateReleasePitch: { type: 'paid' },
    });
    hoisted.gatewayMock.mockReturnValue('gateway-model');
    hoisted.createAuthenticatedCorsHeadersMock.mockReturnValue({
      'access-control-allow-origin': 'http://localhost:3000',
    });
    hoisted.streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: vi.fn(
        ({ headers }) =>
          new Response('stream', {
            status: 200,
            headers: {
              'content-type': 'text/event-stream',
              ...headers,
            },
          })
      ),
    });
  });

  it('streams using imported tool builders instead of inline tool definitions', async () => {
    const { POST } = await import('@/app/api/chat/route');

    const response = await POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
          'x-request-id': 'req_123',
        },
        body: JSON.stringify({
          artistContext: {
            displayName: 'Tim White',
            username: 'timwhite',
            bio: 'Bio',
            genres: ['indie'],
            spotifyFollowers: null,
            spotifyPopularity: null,
            spotifyUrl: null,
            appleMusicUrl: null,
            profileViews: 0,
            hasSocialLinks: true,
            hasMusicLinks: true,
            tippingStats: {
              tipClicks: 0,
              tipsSubmitted: 0,
              totalReceivedCents: 0,
              monthReceivedCents: 0,
            },
          },
          messages: [
            {
              id: 'msg_1',
              role: 'user',
              parts: [
                { type: 'text', text: 'Generate album art for my release' },
              ],
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('x-request-id')).toBe('req_123');

    expect(hoisted.buildFreeChatToolsMock).toHaveBeenCalledWith(
      null,
      'user_123'
    );
    expect(hoisted.buildChatToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Tim White' }),
      null,
      true,
      'user_123',
      true,
      true
    );

    expect(hoisted.streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'system prompt',
        model: 'gateway-model',
        tools: expect.objectContaining({
          proposeAvatarUpload: { type: 'free' },
          generateAlbumArt: { type: 'paid' },
          createRelease: { type: 'paid' },
          generateReleasePitch: { type: 'paid' },
        }),
      })
    );
  });
});
