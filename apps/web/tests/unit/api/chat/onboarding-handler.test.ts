import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  checkGateForUserMock: vi.fn(),
  executeChatTurnMock: vi.fn(),
  checkAnonymousChatRateLimitMock: vi.fn(),
  isTurnstileConfiguredMock: vi.fn(),
  verifyTurnstileTokenMock: vi.fn(),
  encodeSessionCookieMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  captureMessageMock: vi.fn(),
  setTagMock: vi.fn(),
  setTagsMock: vi.fn(),
  setExtraMock: vi.fn(),
  addBreadcrumbMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/flags/server', () => ({
  checkGateForUser: hoisted.checkGateForUserMock,
}));

vi.mock('@/lib/chat/run', () => ({
  executeChatTurn: hoisted.executeChatTurnMock,
  isClientDisconnect: () => false,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAnonymousChatRateLimit: hoisted.checkAnonymousChatRateLimitMock,
  createRateLimitHeaders: () => ({}),
}));

vi.mock('@/lib/turnstile/verify', () => ({
  isTurnstileConfigured: hoisted.isTurnstileConfiguredMock,
  verifyTurnstileToken: hoisted.verifyTurnstileTokenMock,
}));

vi.mock('@/lib/onboarding/session', () => ({
  ONBOARDING_SESSION_COOKIE_NAME: 'jovie_onboarding_session',
  verifySessionCookie: (v: string | undefined) =>
    v && v.startsWith('valid-session.')
      ? v.slice('valid-session.'.length)
      : null,
  encodeSessionCookie: hoisted.encodeSessionCookieMock,
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIPFromRequest: () => '203.0.113.5',
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: hoisted.captureExceptionMock,
  captureMessage: hoisted.captureMessageMock,
  setTag: hoisted.setTagMock,
  setTags: hoisted.setTagsMock,
  setExtra: hoisted.setExtraMock,
  addBreadcrumb: hoisted.addBreadcrumbMock,
}));

// Default to development so the Turnstile fail-closed path doesn't fire in
// the happy-path tests. The "non-dev" test overrides this with vi.doMock.
vi.mock('@/lib/env-server', () => ({
  env: { NODE_ENV: 'development' },
  isSecureEnv: () => false,
}));

function makeRequest(body: unknown, cookieHeader = ''): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieHeader,
    },
    body: JSON.stringify(body),
  });
}

function userMessage(text: string) {
  return {
    id: crypto.randomUUID(),
    role: 'user' as const,
    parts: [{ type: 'text', text }],
  };
}

describe('tryHandleAnonymousOnboardingChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.checkGateForUserMock.mockResolvedValue(true);
    hoisted.checkAnonymousChatRateLimitMock.mockResolvedValue({
      success: true,
    });
    hoisted.isTurnstileConfiguredMock.mockReturnValue(false);
    hoisted.encodeSessionCookieMock.mockImplementation(
      (id: string) => `signed.${id}.sig`
    );
  });

  it('returns null when mode is not onboarding (fall through to authenticated path)', async () => {
    const { tryHandleAnonymousOnboardingChat } = await import(
      '@/app/api/chat/onboarding-handler'
    );
    const req = makeRequest({ mode: 'app', messages: [userMessage('hi')] });
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-1');
    expect(result).toBeNull();
    expect(hoisted.checkGateForUserMock).not.toHaveBeenCalled();
  });

  it('returns 503 when the Statsig kill-switch is disabled', async () => {
    hoisted.checkGateForUserMock.mockResolvedValue(false);
    const { tryHandleAnonymousOnboardingChat } = await import(
      '@/app/api/chat/onboarding-handler'
    );
    const req = makeRequest({
      mode: 'onboarding',
      messages: [userMessage('hi')],
    });
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-2');
    expect(result).not.toBeNull();
    expect(result?.status).toBe(503);
    const body = await result?.json();
    expect(body.errorCode).toBe('ONBOARDING_CHAT_DISABLED');
    // Dispatch must NOT have been called when the gate is closed.
    expect(hoisted.executeChatTurnMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the messages array is missing', async () => {
    const { tryHandleAnonymousOnboardingChat } = await import(
      '@/app/api/chat/onboarding-handler'
    );
    const req = makeRequest({ mode: 'onboarding' });
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-3');
    expect(result?.status).toBe(400);
    const body = await result?.json();
    expect(body.errorCode).toBe('INVALID_MESSAGES');
  });

  it('returns 400 when a message is shaped wrong', async () => {
    const { tryHandleAnonymousOnboardingChat } = await import(
      '@/app/api/chat/onboarding-handler'
    );
    const req = makeRequest({
      mode: 'onboarding',
      messages: [{ role: 'banana', parts: [] }],
    });
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-4');
    expect(result?.status).toBe(400);
    const body = await result?.json();
    expect(body.errorCode).toBe('INVALID_MESSAGES');
  });

  it('returns 503 when Turnstile is not configured outside dev (first turn)', async () => {
    // Re-mock env to non-dev for this case.
    vi.resetModules();
    vi.doMock('@/lib/env-server', () => ({
      env: { NODE_ENV: 'production' },
      isSecureEnv: () => true,
    }));
    hoisted.isTurnstileConfiguredMock.mockReturnValue(false);
    const { tryHandleAnonymousOnboardingChat } = await import(
      '@/app/api/chat/onboarding-handler'
    );
    const req = makeRequest({
      mode: 'onboarding',
      messages: [userMessage('hi')],
    });
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-5');
    expect(result?.status).toBe(503);
    const body = await result?.json();
    expect(body.errorCode).toBe('TURNSTILE_NOT_CONFIGURED');
  });

  it('dispatches executeChatTurn with mode=onboarding and the 7 onboarding tools', async () => {
    vi.resetModules();
    // Restore the dev env mock so Turnstile gate is skipped.
    vi.doMock('@/lib/env-server', () => ({
      env: { NODE_ENV: 'development' },
      isSecureEnv: () => false,
    }));
    // Make executeChatTurn return a fake stream response.
    hoisted.executeChatTurnMock.mockResolvedValue({
      streamResult: {
        toUIMessageStreamResponse: ({
          headers,
        }: {
          headers: Record<string, string>;
        }) => new Response('ok', { status: 200, headers }),
      },
      selectedModel: 'anthropic/claude-haiku-4-5-20251001',
      systemPrompt: '<onboarding prompt>',
      toolNames: [
        'checkHandle',
        'confirmSpotifyArtist',
        'proposeCheckout',
        'proposeNextStep',
        'proposeSocialLink',
        'recordInterviewSignal',
        'searchSpotifyArtist',
      ],
      modelMessages: [],
    });

    const { tryHandleAnonymousOnboardingChat } = await import(
      '@/app/api/chat/onboarding-handler'
    );
    const req = makeRequest({
      mode: 'onboarding',
      messages: [userMessage("I'm a musician")],
    });
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-6');

    expect(result?.status).toBe(200);
    expect(hoisted.executeChatTurnMock).toHaveBeenCalledTimes(1);

    const call = hoisted.executeChatTurnMock.mock.calls[0]![0];
    expect(call.mode).toBe('onboarding');
    expect(call.userId).toBeNull();
    expect(call.artistContext).toBeNull();
    expect(call.resolvedProfileId).toBeNull();
    expect(call.forceLightModel).toBe(true);
    expect(call.userPlan).toBe('free');
    // The 7 tool names: 6 onboarding-specific + proposeSocialLink reused
    expect(Object.keys(call.tools).sort()).toEqual([
      'checkHandle',
      'confirmSpotifyArtist',
      'proposeCheckout',
      'proposeNextStep',
      'proposeSocialLink',
      'recordInterviewSignal',
      'searchSpotifyArtist',
    ]);

    // Fresh session → set-cookie header on the response
    expect(result?.headers.get('set-cookie')).toContain(
      'jovie_onboarding_session='
    );
    expect(result?.headers.get('x-chat-mode')).toBe('onboarding');
  });

  it('reuses an existing valid session cookie (no fresh cookie minted)', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env-server', () => ({
      env: { NODE_ENV: 'development' },
      isSecureEnv: () => false,
    }));
    hoisted.executeChatTurnMock.mockResolvedValue({
      streamResult: {
        toUIMessageStreamResponse: ({
          headers,
        }: {
          headers: Record<string, string>;
        }) => new Response('ok', { status: 200, headers }),
      },
      selectedModel: 'anthropic/claude-haiku-4-5-20251001',
      systemPrompt: '',
      toolNames: [],
      modelMessages: [],
    });

    const { tryHandleAnonymousOnboardingChat } = await import(
      '@/app/api/chat/onboarding-handler'
    );
    const existingSessionId = '00112233-4455-6677-8899-aabbccddeeff';
    const req = makeRequest(
      { mode: 'onboarding', messages: [userMessage('hi again')] },
      `jovie_onboarding_session=valid-session.${existingSessionId}`
    );
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-7');

    expect(result?.status).toBe(200);
    // No fresh cookie minted on a returning session
    expect(result?.headers.get('set-cookie')).toBeNull();
    expect(hoisted.encodeSessionCookieMock).not.toHaveBeenCalled();
  });
});
