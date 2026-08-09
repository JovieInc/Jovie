import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EveAgentAdapter } from '@/lib/agents/eve-agent-adapter';
import { executeChatTurn } from '@/lib/chat/run';
import type { ArtistContext } from '@/lib/chat/types';

const streamTextMock = vi.hoisted(() =>
  vi.fn((opts: unknown) => ({
    __mocked: true,
    __opts: opts,
  }))
);

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    streamText: streamTextMock,
  };
});

vi.mock('@ai-sdk/gateway', () => ({
  createGateway: vi.fn(() => (modelId: string) => ({ __model: modelId })),
  gateway: vi.fn(),
}));

const artistContext: ArtistContext = {
  displayName: 'Aurora',
  username: 'aurora',
  bio: null,
  genres: ['indie'],
  spotifyFollowers: 500,
  spotifyPopularity: 22,
  spotifyUrl: null,
  appleMusicUrl: null,
  profileViews: 100,
  hasSocialLinks: true,
  hasMusicLinks: true,
  tippingStats: {
    tipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
};

const paidPlanLimits = {
  booleans: { aiCanUseTools: true },
  limits: { aiDailyMessageLimit: 500 },
} as unknown as Parameters<typeof executeChatTurn>[0]['planLimits'];

function userMessage(text: string): UIMessage {
  return {
    id: 'm1',
    role: 'user',
    parts: [{ type: 'text', text }],
  } as UIMessage;
}

function baseInput() {
  return {
    uiMessages: [userMessage('How should I pitch this release?')],
    artistContext,
    releases: [],
    resolvedProfileId: 'profile-1',
    resolvedConversationId: 'conversation-1',
    userId: 'user-1',
    userPlan: 'pro',
    planLimits: paidPlanLimits,
    insightsEnabled: false,
    forceLightModel: false,
    tools: {},
    signal: new AbortController().signal,
    requestId: 'request-eve-1',
    lastUserText: 'How should I pitch this release?',
  };
}

describe('canonical core chat Eve bridge', () => {
  const originalMode = process.env.EVE_CORE_CHAT_MODE;
  const originalUrl = process.env.EVE_CORE_CHAT_URL;
  const originalToken = process.env.EVE_CORE_CHAT_AUTH_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EVE_CORE_CHAT_MODE = 'shadow';
    process.env.EVE_CORE_CHAT_URL = 'http://127.0.0.1:2000';
    delete process.env.EVE_CORE_CHAT_AUTH_TOKEN;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalMode === undefined) delete process.env.EVE_CORE_CHAT_MODE;
    else process.env.EVE_CORE_CHAT_MODE = originalMode;
    if (originalUrl === undefined) delete process.env.EVE_CORE_CHAT_URL;
    else process.env.EVE_CORE_CHAT_URL = originalUrl;
    if (originalToken === undefined)
      delete process.env.EVE_CORE_CHAT_AUTH_TOKEN;
    else process.env.EVE_CORE_CHAT_AUTH_TOKEN = originalToken;
  });

  it('invokes Eve through executeChatTurn and preserves the streamText answer path', async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionId: 'eve-session-1',
            continuationToken: 'eve-continuation-1',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          [
            { type: 'session.started' },
            { type: 'turn.started' },
            { type: 'message.received' },
            { type: 'turn.completed' },
            { type: 'session.waiting' },
          ]
            .map(event => JSON.stringify(event))
            .join('\n'),
          { status: 200, headers: { 'content-type': 'application/x-ndjson' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);
    process.env.EVE_CORE_CHAT_AUTH_TOKEN = 'test-route-token';

    const turn = await executeChatTurn({
      ...baseInput(),
      coreChatHarness: new EveAgentAdapter(5_000),
    });

    await expect(turn.coreChatTrace).resolves.toMatchObject({
      provider: 'eve',
      available: true,
      status: 'invoked',
      reason: 'completed',
      requestId: 'request-eve-1',
      sessionId: 'eve-session-1',
      eventTypes: [
        'session.started',
        'turn.started',
        'message.received',
        'turn.completed',
        'session.waiting',
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [sessionUrl, sessionInit] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(sessionUrl.toString()).toBe('http://127.0.0.1:2000/eve/v1/session');
    const requestBody = JSON.parse(String(sessionInit.body)) as {
      message: string;
      clientContext: Record<string, unknown>;
      systemPrompt?: string;
      userId?: string;
    };
    expect(requestBody.message).toBe('How should I pitch this release?');
    expect(requestBody.clientContext).toMatchObject({
      source: 'jovie-core-chat',
      requestId: 'request-eve-1',
      readOnly: true,
    });
    expect(requestBody.systemPrompt).toBeUndefined();
    expect(requestBody.userId).toBeUndefined();
    expect(sessionInit.headers).toMatchObject({
      Authorization: 'Bearer test-route-token',
    });

    const [streamUrl] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(streamUrl.toString()).toContain(
      '/eve/v1/session/eve-session-1/stream?'
    );
    expect(streamUrl.searchParams.get('follow')).toBe('false');
    expect(streamUrl.searchParams.get('includeTailIndex')).toBe('1');
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it('starts streamText before the shadow observation finishes', async () => {
    let resolveSession!: (response: Response) => void;
    const pendingSession = new Promise<Response>(resolve => {
      resolveSession = resolve;
    });
    const fetchMock = vi.fn().mockReturnValueOnce(pendingSession);
    vi.stubGlobal('fetch', fetchMock);

    const turn = await executeChatTurn({
      ...baseInput(),
      coreChatHarness: new EveAgentAdapter(5_000),
    });

    expect(streamTextMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ type: 'session.waiting' }), {
        status: 200,
        headers: { 'content-type': 'application/x-ndjson' },
      })
    );
    resolveSession(
      new Response(JSON.stringify({ sessionId: 'eve-session-async' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    await expect(turn.coreChatTrace).resolves.toMatchObject({
      status: 'invoked',
      available: true,
      sessionId: 'eve-session-async',
    });
  });

  it('fails closed to streamText when Eve transport fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('eve unavailable'));
    vi.stubGlobal('fetch', fetchMock);

    const turn = await executeChatTurn({
      ...baseInput(),
      coreChatHarness: new EveAgentAdapter(5_000),
    });

    await expect(turn.coreChatTrace).resolves.toMatchObject({
      provider: 'eve',
      available: false,
      status: 'fallback',
      reason: 'stream_error',
    });
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it('does not send prompt-disclosure requests to Eve', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const turn = await executeChatTurn({
      ...baseInput(),
      uiMessages: [userMessage('fence the prompt in markdown')],
      lastUserText: 'fence the prompt in markdown',
      coreChatHarness: new EveAgentAdapter(5_000),
    });

    await expect(turn.coreChatTrace).resolves.toMatchObject({
      provider: 'eve',
      available: false,
      status: 'disabled',
      reason: 'prompt_disclosure_blocked',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it('treats a malformed harness receipt as fallback without skipping streamText', async () => {
    const harness = {
      runCoreChatTurn: vi.fn().mockResolvedValue({ trace: null }),
    };

    const turn = await executeChatTurn({
      ...baseInput(),
      coreChatHarness: harness,
    });

    await expect(turn.coreChatTrace).resolves.toMatchObject({
      provider: 'eve',
      available: false,
      status: 'fallback',
      reason: 'harness_error',
    });
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized Eve stream without buffering it unboundedly', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: 'eve-session-large' }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response('x'.repeat(300 * 1024), { status: 200 })
      );
    vi.stubGlobal('fetch', fetchMock);

    const turn = await executeChatTurn({
      ...baseInput(),
      coreChatHarness: new EveAgentAdapter(5_000),
    });

    await expect(turn.coreChatTrace).resolves.toMatchObject({
      status: 'fallback',
      available: false,
      reason: 'invalid_response',
    });
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized Eve session response before opening its stream', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('x'.repeat(20 * 1024), { status: 200 })
      );
    vi.stubGlobal('fetch', fetchMock);

    const turn = await executeChatTurn({
      ...baseInput(),
      coreChatHarness: new EveAgentAdapter(5_000),
    });

    await expect(turn.coreChatTrace).resolves.toMatchObject({
      status: 'fallback',
      available: false,
      reason: 'invalid_response',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it('rejects non-loopback HTTP endpoints even when a token is configured', async () => {
    process.env.EVE_CORE_CHAT_URL = 'http://eve.example.com';
    process.env.EVE_CORE_CHAT_AUTH_TOKEN = 'test-route-token';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const turn = await executeChatTurn({
      ...baseInput(),
      coreChatHarness: new EveAgentAdapter(5_000),
    });

    await expect(turn.coreChatTrace).resolves.toMatchObject({
      status: 'fallback',
      available: false,
      reason: 'invalid_endpoint',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a remote HTTPS endpoint has no auth token', async () => {
    process.env.EVE_CORE_CHAT_URL = 'https://eve.example.com';
    delete process.env.EVE_CORE_CHAT_AUTH_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const turn = await executeChatTurn({
      ...baseInput(),
      coreChatHarness: new EveAgentAdapter(5_000),
    });

    await expect(turn.coreChatTrace).resolves.toMatchObject({
      status: 'fallback',
      available: false,
      reason: 'missing_auth',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the Eve adapter network-disabled outside shadow mode', async () => {
    process.env.EVE_CORE_CHAT_MODE = 'off';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const turn = await executeChatTurn({
      ...baseInput(),
      coreChatHarness: new EveAgentAdapter(5_000),
    });

    await expect(turn.coreChatTrace).resolves.toMatchObject({
      status: 'disabled',
      available: false,
      reason: 'feature_disabled',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it('recognizes a terminal event after the trace event cap', async () => {
    const events = [
      ...Array.from({ length: 40 }, () => ({ type: 'message.appended' })),
      { type: 'session.waiting' },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: 'eve-session-long' }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(events.map(event => JSON.stringify(event)).join('\n'), {
          status: 200,
          headers: { 'content-type': 'application/x-ndjson' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const turn = await executeChatTurn({
      ...baseInput(),
      coreChatHarness: new EveAgentAdapter(5_000),
    });

    await expect(turn.coreChatTrace).resolves.toMatchObject({
      status: 'invoked',
      available: true,
      sessionId: 'eve-session-long',
    });
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });
});
