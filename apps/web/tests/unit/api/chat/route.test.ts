import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_MODEL, CHAT_MODEL_LIGHT } from '@/lib/constants/ai-models';

const hoisted = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  getUserBillingInfoMock: vi.fn(),
  getEntitlementsMock: vi.fn(),
  getCurrentUserEntitlementsMock: vi.fn(),
  checkAiChatRateLimitForPlanMock: vi.fn(),
  createRateLimitHeadersMock: vi.fn(),
  classifyIntentMock: vi.fn(),
  isDeterministicIntentMock: vi.fn(),
  routeIntentMock: vi.fn(),
  selectKnowledgeContextMock: vi.fn(),
  buildSystemPromptMock: vi.fn(),
  convertToModelMessagesMock: vi.fn(),
  streamTextMock: vi.fn(),
  gatewayMock: vi.fn(),
  selectMock: vi.fn(),
  addBreadcrumbMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  selectResults: [] as unknown[],
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));

vi.mock('@/lib/stripe/customer-sync/billing-info', () => ({
  getUserBillingInfo: hoisted.getUserBillingInfoMock,
}));

vi.mock('@/lib/entitlements/registry', () => ({
  getEntitlements: hoisted.getEntitlementsMock,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlementsMock,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAiChatRateLimitForPlan: hoisted.checkAiChatRateLimitForPlanMock,
  createRateLimitHeaders: hoisted.createRateLimitHeadersMock,
}));

vi.mock('@/lib/intent-detection', () => ({
  classifyIntent: hoisted.classifyIntentMock,
  isDeterministicIntent: hoisted.isDeterministicIntentMock,
  routeIntent: hoisted.routeIntentMock,
}));

vi.mock('@/lib/chat/knowledge/router', () => ({
  selectKnowledgeContext: hoisted.selectKnowledgeContextMock,
}));

vi.mock('@/lib/chat/system-prompt', () => ({
  buildSystemPrompt: hoisted.buildSystemPromptMock,
}));

vi.mock('@/lib/http/headers', () => ({
  createAuthenticatedCorsHeaders: vi.fn().mockReturnValue({
    'access-control-allow-origin': 'http://localhost:3000',
  }),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
  },
}));

vi.mock('@/lib/db/sql-helpers', () => ({
  sqlAny: vi.fn().mockReturnValue('sql-any'),
}));

vi.mock('ai', () => ({
  convertToModelMessages: hoisted.convertToModelMessagesMock,
  streamText: hoisted.streamTextMock,
  tool: (config: unknown) => config,
}));

vi.mock('@ai-sdk/gateway', () => ({
  gateway: hoisted.gatewayMock,
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: hoisted.addBreadcrumbMock,
  captureException: hoisted.captureExceptionMock,
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(() => 'sql'),
}));

function makeSelectChain(result: unknown) {
  const builder = {
    from: vi.fn(() => builder),
    leftJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(async () => result),
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (error: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  };

  return builder;
}

function queueSelectResults(...results: unknown[]) {
  hoisted.selectResults.splice(0, hoisted.selectResults.length, ...results);
  hoisted.selectMock.mockImplementation(() =>
    makeSelectChain(hoisted.selectResults.shift() ?? [])
  );
}

function createRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'http://localhost:3000',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.getUserBillingInfoMock.mockResolvedValue({
      success: true,
      data: { plan: 'pro' },
    });
    hoisted.getEntitlementsMock.mockReturnValue({
      booleans: { aiCanUseTools: true },
      limits: { aiDailyMessageLimit: 50 },
    });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({ isPro: false });
    hoisted.checkAiChatRateLimitForPlanMock.mockResolvedValue({
      success: true,
      reset: new Date(Date.now() + 60_000),
    });
    hoisted.createRateLimitHeadersMock.mockReturnValue({
      'x-ratelimit-remaining': '49',
    });
    hoisted.classifyIntentMock.mockReturnValue(null);
    hoisted.isDeterministicIntentMock.mockReturnValue(false);
    hoisted.routeIntentMock.mockResolvedValue(null);
    hoisted.selectKnowledgeContextMock.mockReturnValue({
      content: 'Knowledge content',
      topicIds: ['release-strategy'],
      hasVolatileTopics: false,
      cautions: [],
    });
    hoisted.buildSystemPromptMock.mockReturnValue('system prompt');
    hoisted.convertToModelMessagesMock.mockResolvedValue([]);
    hoisted.gatewayMock.mockImplementation(model => `gateway:${String(model)}`);
    hoisted.streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: vi
        .fn()
        .mockReturnValue(new Response('stream ok', { status: 200 })),
    });

    queueSelectResults(
      [
        {
          displayName: 'Nova Bloom',
          username: 'novabloom',
          bio: 'Indie pop artist',
          genres: ['indie-pop'],
          spotifyFollowers: 8400,
          spotifyPopularity: 38,
          spotifyUrl: null,
          appleMusicUrl: null,
          profileViews: 1500,
          userClerkId: 'user_123',
        },
      ],
      [{ totalActive: 1, musicActive: 1 }],
      [{ totalReceived: 1500, monthReceived: 500, tipsSubmitted: 2 }],
      [{ total: 9 }],
      [
        {
          id: 'release_1',
          title: 'Bloom EP',
          releaseType: 'ep',
          releaseDate: new Date('2025-04-10T00:00:00.000Z'),
          artworkUrl: null,
          spotifyPopularity: 45,
          totalTracks: 5,
          metadata: null,
        },
      ]
    );
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: null });

    const { POST } = await import('@/app/api/chat/route');
    const response = await POST(
      createRequest({
        profileId: 'profile_123',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
      })
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 when profileId is missing and records a breadcrumb', async () => {
    const { POST } = await import('@/app/api/chat/route');
    const response = await POST(
      createRequest({
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Missing profileId',
    });
    expect(hoisted.addBreadcrumbMock).toHaveBeenCalled();
  });

  it('returns 400 for invalid message role', async () => {
    const { POST } = await import('@/app/api/chat/route');
    const response = await POST(
      createRequest({
        profileId: 'profile_123',
        messages: [
          { role: 'system', parts: [{ type: 'text', text: 'Hello' }] },
        ],
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid message role',
    });
  });

  it('returns 400 when a user message is too long', async () => {
    const { POST } = await import('@/app/api/chat/route');
    const response = await POST(
      createRequest({
        profileId: 'profile_123',
        messages: [
          {
            role: 'user',
            parts: [{ type: 'text', text: 'x'.repeat(4001) }],
          },
        ],
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Message too long. Maximum is 4000 characters',
    });
  });

  it('returns 400 when too many messages are sent', async () => {
    const { POST } = await import('@/app/api/chat/route');
    const response = await POST(
      createRequest({
        profileId: 'profile_123',
        messages: Array.from({ length: 51 }, () => ({
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }],
        })),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Too many messages. Maximum is 50',
    });
  });

  it('short-circuits deterministic intents and returns intent headers', async () => {
    hoisted.classifyIntentMock.mockReturnValue({
      category: 'PROFILE_UPDATE_NAME',
      confidence: 1,
      extractedData: { value: 'Nova Bloom' },
      rawMessage: 'change my name to Nova Bloom',
    });
    hoisted.isDeterministicIntentMock.mockReturnValue(true);
    hoisted.routeIntentMock.mockResolvedValue({
      success: true,
      message: 'Updated',
    });

    const { POST } = await import('@/app/api/chat/route');
    const response = await POST(
      createRequest({
        profileId: 'profile_123',
        messages: [
          {
            role: 'user',
            parts: [{ type: 'text', text: 'change my name to Nova Bloom' }],
          },
        ],
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-intent-routed')).toBe('true');
    expect(response.headers.get('x-intent-category')).toBe(
      'PROFILE_UPDATE_NAME'
    );
    expect(hoisted.streamTextMock).not.toHaveBeenCalled();
  });

  it('uses the lightweight model for short tool-oriented requests', async () => {
    const { POST } = await import('@/app/api/chat/route');
    const response = await POST(
      createRequest({
        profileId: 'profile_123',
        messages: [
          { role: 'user', parts: [{ type: 'text', text: 'format my lyrics' }] },
        ],
      })
    );

    expect(response.status).toBe(200);
    expect(hoisted.gatewayMock).toHaveBeenCalledWith(CHAT_MODEL_LIGHT);
  });

  it('uses the primary chat model for non-simple requests', async () => {
    const { POST } = await import('@/app/api/chat/route');
    const response = await POST(
      createRequest({
        profileId: 'profile_123',
        messages: [
          {
            role: 'user',
            parts: [
              {
                type: 'text',
                text: 'What should I do to grow my audience over the next month?',
              },
            ],
          },
        ],
      })
    );

    expect(response.status).toBe(200);
    expect(hoisted.gatewayMock).toHaveBeenCalledWith(CHAT_MODEL);
  });

  it('returns 429 with retryAfter when rate limited', async () => {
    hoisted.checkAiChatRateLimitForPlanMock.mockResolvedValue({
      success: false,
      reason: 'Rate limit exceeded',
      reset: new Date(Date.now() + 1_500),
    });

    const { POST } = await import('@/app/api/chat/route');
    const response = await POST(
      createRequest({
        profileId: 'profile_123',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
      })
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Rate limit exceeded',
      retryAfter: 2,
    });
  });

  it('returns a standardized error payload when streaming fails', async () => {
    hoisted.streamTextMock.mockImplementation(() => {
      throw Object.assign(new Error('Gateway exploded'), {
        code: 'CHAT_STREAM_FAILED',
      });
    });

    const { POST } = await import('@/app/api/chat/route');
    const response = await POST(
      createRequest({
        profileId: 'profile_123',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Failed to process chat request',
      message:
        'Jovie hit a temporary issue while processing your message. Please try again.',
      errorCode: 'CHAT_STREAM_FAILED',
      debugMessage: 'Gateway exploded',
    });
    expect(hoisted.captureExceptionMock).toHaveBeenCalled();
  });

  it('builds knowledge context from the last three user turns and passes it to the prompt', async () => {
    const knowledgeContext = {
      content: 'Knowledge content',
      topicIds: ['release-strategy', 'playlist-strategy'],
      hasVolatileTopics: true,
      cautions: ['Release timing can change.'],
    };
    hoisted.selectKnowledgeContextMock.mockReturnValue(knowledgeContext);

    const { POST } = await import('@/app/api/chat/route');
    const response = await POST(
      createRequest({
        profileId: 'profile_123',
        messages: [
          { role: 'user', parts: [{ type: 'text', text: 'First question' }] },
          { role: 'assistant', parts: [{ type: 'text', text: 'Reply' }] },
          { role: 'user', parts: [{ type: 'text', text: 'Second question' }] },
          { role: 'user', parts: [{ type: 'text', text: 'Third question' }] },
          { role: 'user', parts: [{ type: 'text', text: 'Latest question' }] },
        ],
      })
    );

    expect(response.status).toBe(200);
    expect(hoisted.selectKnowledgeContextMock).toHaveBeenCalledWith(
      'Latest question Third question Second question'
    );
    expect(hoisted.buildSystemPromptMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      expect.objectContaining({
        knowledgeContext,
      })
    );
  });
});
