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
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbSelectRowsMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/flags/server', () => ({
  checkGateForUser: hoisted.checkGateForUserMock,
}));

vi.mock('@/lib/chat/run', () => ({
  executeChatTurn: hoisted.executeChatTurnMock,
  isClientDisconnect: () => false,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.dbSelectMock,
    insert: hoisted.dbInsertMock,
    update: hoisted.dbUpdateMock,
  },
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

function makeRequest(
  body: unknown,
  cookieHeader = '',
  headers: Record<string, string> = {}
): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieHeader,
      ...headers,
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

function installDefaultDbMocks() {
  hoisted.dbSelectRowsMock.mockResolvedValue([]);
  hoisted.dbSelectMock.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: hoisted.dbSelectRowsMock,
        }),
      }),
    }),
  }));
  hoisted.dbInsertMock.mockImplementation(() => ({
    values: () => ({
      returning: vi.fn().mockResolvedValue([{ id: 'conv_anonymous' }]),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  }));
  hoisted.dbUpdateMock.mockImplementation(() => ({
    set: () => ({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }));
}

function stubRuntimeEnv({
  nodeEnv = 'development',
  vercelEnv,
}: {
  readonly nodeEnv?: string;
  readonly vercelEnv?: string;
} = {}) {
  vi.stubEnv('NODE_ENV', nodeEnv);
  if (vercelEnv) {
    vi.stubEnv('VERCEL_ENV', vercelEnv);
  } else {
    vi.stubEnv('VERCEL_ENV', '');
  }
}

describe('tryHandleAnonymousOnboardingChat', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.resetAllMocks();
    stubRuntimeEnv();
    hoisted.checkGateForUserMock.mockResolvedValue(true);
    hoisted.checkAnonymousChatRateLimitMock.mockResolvedValue({
      success: true,
    });
    hoisted.isTurnstileConfiguredMock.mockReturnValue(false);
    hoisted.encodeSessionCookieMock.mockImplementation(
      (id: string) => `signed.${id}.sig`
    );
    installDefaultDbMocks();
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

  it('does not let the removed onboarding rollout gate disable the live route', async () => {
    vi.resetModules();
    stubRuntimeEnv({ nodeEnv: 'production' });
    hoisted.checkGateForUserMock.mockResolvedValue(false);
    hoisted.isTurnstileConfiguredMock.mockReturnValue(true);
    hoisted.verifyTurnstileTokenMock.mockResolvedValue({
      success: false,
      reason: 'missing_token',
    });
    const { tryHandleAnonymousOnboardingChat } = await import(
      '@/app/api/chat/onboarding-handler'
    );
    const req = makeRequest({
      mode: 'onboarding',
      messages: [userMessage('hi')],
    });
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-2a');
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
    const body = await result?.json();
    expect(body.errorCode).toBe('TURNSTILE_REQUIRED');
    expect(hoisted.checkGateForUserMock).toHaveBeenCalledWith(
      null,
      'ai_chat_disabled',
      false
    );
    expect(hoisted.checkGateForUserMock).not.toHaveBeenCalledWith(
      null,
      'onboarding_chat_v2',
      false
    );
  });

  it('serves the scripted fallback when the global chat kill-switch is enabled', async () => {
    vi.resetModules();
    stubRuntimeEnv({ nodeEnv: 'production' });
    hoisted.checkGateForUserMock.mockResolvedValue(true);
    hoisted.isTurnstileConfiguredMock.mockReturnValue(true);
    hoisted.verifyTurnstileTokenMock.mockResolvedValue({ success: true });
    const { tryHandleAnonymousOnboardingChat } = await import(
      '@/app/api/chat/onboarding-handler'
    );
    const req = makeRequest({
      mode: 'onboarding',
      turnstileToken: 'tok',
      messages: [userMessage('hi')],
    });
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-2');
    expect(result).not.toBeNull();
    // The kill switch no longer blocks onboarding — the deterministic script
    // answers instead (JOV-3806).
    expect(result?.status).toBe(200);
    expect(result?.headers.get('x-fallback-reason')).toBe('kill_switch');
    expect(result?.headers.get('x-onboarding-fallback')).toMatch(/^greet:/);
    expect(await result?.text()).toContain("I'm Jovie");
    // The LLM must NOT have been called when the gate is closed.
    expect(hoisted.executeChatTurnMock).not.toHaveBeenCalled();
  });

  it('serves the scripted fallback when executeChatTurn throws', async () => {
    vi.resetModules();
    stubRuntimeEnv();
    hoisted.executeChatTurnMock.mockRejectedValue(
      new Error('anthropic 529 overloaded')
    );
    const { tryHandleAnonymousOnboardingChat } = await import(
      '@/app/api/chat/onboarding-handler'
    );
    const req = makeRequest({
      mode: 'onboarding',
      messages: [userMessage('hi, I want in')],
    });
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-llm-down');

    expect(result?.status).toBe(200);
    expect(result?.headers.get('x-fallback-reason')).toBe('llm_error');
    expect(result?.headers.get('x-onboarding-fallback')).toMatch(/^greet:/);
    // Fresh session still gets its cookie even on the fallback path.
    expect(result?.headers.get('set-cookie')).toContain(
      'jovie_onboarding_session='
    );
    expect(await result?.text()).toContain("I'm Jovie");
    // The LLM failure still pages.
    expect(hoisted.captureExceptionMock).toHaveBeenCalled();
  });

  it('opens the artist picker via fallback on a later turn when the LLM is down', async () => {
    vi.resetModules();
    stubRuntimeEnv();
    hoisted.executeChatTurnMock.mockRejectedValue(new Error('provider down'));
    const { tryHandleAnonymousOnboardingChat } = await import(
      '@/app/api/chat/onboarding-handler'
    );
    const req = makeRequest({
      mode: 'onboarding',
      messages: [
        userMessage('hey'),
        {
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          parts: [{ type: 'text', text: 'What are you working on?' }],
        },
        userMessage('I am Test Artist'),
      ],
    });
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-picker');

    expect(result?.status).toBe(200);
    expect(result?.headers.get('x-onboarding-fallback')).toMatch(
      /^get_artist:/
    );
    const body = await result?.text();
    expect(body).toContain('open_artist_picker');
    expect(body).toContain('searchSpotifyArtist');
  });

  it('honors LLM failure injection only when the server env enables it', async () => {
    vi.resetModules();
    stubRuntimeEnv();
    vi.stubEnv('CHAT_LLM_FAILURE_INJECTION', '1');
    const { tryHandleAnonymousOnboardingChat } = await import(
      '@/app/api/chat/onboarding-handler'
    );
    const req = makeRequest(
      { mode: 'onboarding', messages: [userMessage('hi')] },
      '',
      { 'x-jovie-e2e-llm-failure': '1' }
    );
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-inject');

    expect(result?.status).toBe(200);
    expect(result?.headers.get('x-fallback-reason')).toBe('injected');
    expect(hoisted.executeChatTurnMock).not.toHaveBeenCalled();
  });

  it('ignores the injection header when the env flag is not set', async () => {
    vi.resetModules();
    stubRuntimeEnv();
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
    const req = makeRequest(
      { mode: 'onboarding', messages: [userMessage('hi')] },
      '',
      { 'x-jovie-e2e-llm-failure': '1' }
    );
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-noinject');

    expect(result?.status).toBe(200);
    expect(result?.headers.get('x-fallback-reason')).toBeNull();
    expect(hoisted.executeChatTurnMock).toHaveBeenCalledTimes(1);
  });

  it('ignores the injection header on production deploys even with the env flag', async () => {
    vi.resetModules();
    stubRuntimeEnv({ nodeEnv: 'production', vercelEnv: 'production' });
    vi.stubEnv('CHAT_LLM_FAILURE_INJECTION', '1');
    hoisted.checkGateForUserMock.mockResolvedValue(false);
    hoisted.isTurnstileConfiguredMock.mockReturnValue(true);
    hoisted.verifyTurnstileTokenMock.mockResolvedValue({ success: true });
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
    const req = makeRequest(
      {
        mode: 'onboarding',
        turnstileToken: 'tok',
        messages: [userMessage('hi')],
      },
      '',
      { 'x-jovie-e2e-llm-failure': '1' }
    );
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-prod');

    expect(result?.status).toBe(200);
    expect(result?.headers.get('x-fallback-reason')).toBeNull();
    expect(hoisted.executeChatTurnMock).toHaveBeenCalledTimes(1);
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

  it('returns 400 when the messages array is empty', async () => {
    const { tryHandleAnonymousOnboardingChat } = await import(
      '@/app/api/chat/onboarding-handler'
    );
    const req = makeRequest({ mode: 'onboarding', messages: [] });
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-3b');
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
    vi.resetModules();
    stubRuntimeEnv({ nodeEnv: 'production' });
    hoisted.checkGateForUserMock.mockResolvedValue(false);
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

  it('skips Turnstile verification in explicit E2E mock runtime', async () => {
    vi.resetModules();
    stubRuntimeEnv({ nodeEnv: 'test' });
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '1');
    vi.stubEnv('NEXT_PUBLIC_CLERK_MOCK', '1');
    hoisted.checkGateForUserMock.mockResolvedValue(true);
    hoisted.isTurnstileConfiguredMock.mockReturnValue(false);
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
    const req = makeRequest({
      mode: 'onboarding',
      turnstileToken: 'local-dev-turnstile-bypass',
      messages: [userMessage('hi')],
    });
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-e2e');

    expect(result?.status).toBe(200);
    expect(hoisted.checkGateForUserMock).not.toHaveBeenCalled();
    expect(hoisted.isTurnstileConfiguredMock).not.toHaveBeenCalled();
    expect(hoisted.verifyTurnstileTokenMock).not.toHaveBeenCalled();
  });

  it('skips Turnstile for explicit public smoke runs on loopback', async () => {
    vi.resetModules();
    stubRuntimeEnv({ nodeEnv: 'production' });
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    hoisted.checkGateForUserMock.mockResolvedValue(true);
    hoisted.isTurnstileConfiguredMock.mockReturnValue(false);
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
    const req = makeRequest(
      {
        mode: 'onboarding',
        turnstileToken: 'local-dev-turnstile-bypass',
        messages: [userMessage('hi')],
      },
      '',
      { host: '127.0.0.1:3102' }
    );
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-smoke');

    expect(result?.status).toBe(200);
    expect(hoisted.checkGateForUserMock).not.toHaveBeenCalled();
    expect(hoisted.isTurnstileConfiguredMock).not.toHaveBeenCalled();
    expect(hoisted.verifyTurnstileTokenMock).not.toHaveBeenCalled();
  });

  it('ignores spoofed forwarded hosts for public smoke Turnstile bypass', async () => {
    vi.resetModules();
    stubRuntimeEnv({ nodeEnv: 'production' });
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    hoisted.checkGateForUserMock.mockResolvedValue(false);
    hoisted.isTurnstileConfiguredMock.mockReturnValue(false);

    const { tryHandleAnonymousOnboardingChat } = await import(
      '@/app/api/chat/onboarding-handler'
    );
    const req = makeRequest(
      {
        mode: 'onboarding',
        turnstileToken: 'local-dev-turnstile-bypass',
        messages: [userMessage('hi')],
      },
      '',
      {
        host: 'jov.ie',
        'x-forwarded-host': '127.0.0.1:3102',
      }
    );
    const result = await tryHandleAnonymousOnboardingChat(
      req,
      'req-spoofed-host'
    );

    expect(result?.status).toBe(503);
    const body = await result?.json();
    expect(body.errorCode).toBe('TURNSTILE_NOT_CONFIGURED');
    expect(hoisted.isTurnstileConfiguredMock).toHaveBeenCalledTimes(1);
    expect(hoisted.verifyTurnstileTokenMock).not.toHaveBeenCalled();
  });

  it('keeps Turnstile fail-closed in secure env even when mock flags are set', async () => {
    vi.resetModules();
    stubRuntimeEnv({ nodeEnv: 'production', vercelEnv: 'preview' });
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '1');
    vi.stubEnv('NEXT_PUBLIC_CLERK_MOCK', '1');
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    hoisted.checkGateForUserMock.mockResolvedValue(false);
    hoisted.isTurnstileConfiguredMock.mockReturnValue(false);

    const { tryHandleAnonymousOnboardingChat } = await import(
      '@/app/api/chat/onboarding-handler'
    );
    const req = makeRequest(
      {
        mode: 'onboarding',
        turnstileToken: 'local-dev-turnstile-bypass',
        messages: [userMessage('hi')],
      },
      '',
      { host: '127.0.0.1:3102' }
    );
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-secure');

    expect(result?.status).toBe(503);
    const body = await result?.json();
    expect(body.errorCode).toBe('TURNSTILE_NOT_CONFIGURED');
    expect(hoisted.isTurnstileConfiguredMock).toHaveBeenCalledTimes(1);
    expect(hoisted.verifyTurnstileTokenMock).not.toHaveBeenCalled();
  });

  it('dispatches executeChatTurn with mode=onboarding and the 7 onboarding tools', async () => {
    vi.resetModules();
    stubRuntimeEnv();
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
    expect(call.resolvedConversationId).toBe('conv_anonymous');
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

  it('fails closed before streaming when anonymous persistence is unavailable', async () => {
    vi.resetModules();
    stubRuntimeEnv();
    installDefaultDbMocks();
    hoisted.dbSelectRowsMock.mockRejectedValueOnce(new Error('db unavailable'));

    const { tryHandleAnonymousOnboardingChat } = await import(
      '@/app/api/chat/onboarding-handler'
    );
    const req = makeRequest({
      mode: 'onboarding',
      messages: [userMessage('persist me')],
    });
    const result = await tryHandleAnonymousOnboardingChat(req, 'req-persist');

    expect(result?.status).toBe(503);
    const body = await result?.json();
    expect(body.errorCode).toBe('ONBOARDING_CHAT_PERSISTENCE_FAILED');
    expect(hoisted.executeChatTurnMock).not.toHaveBeenCalled();
  });

  it('reuses an existing valid session cookie (no fresh cookie minted)', async () => {
    vi.resetModules();
    stubRuntimeEnv();
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

  describe('anonymous chat rate-limit E2E guard', () => {
    function mockRateLimitExceeded() {
      hoisted.checkAnonymousChatRateLimitMock.mockResolvedValue({
        success: false,
        limit: 10,
        remaining: 0,
        reset: new Date(Date.now() + 60_000),
        reason: 'Too many anonymous chat requests from this IP',
      });
    }

    function mockChatTurnOk() {
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
    }

    it('still 429s when the limiter trips and the E2E guard is off', async () => {
      vi.resetModules();
      stubRuntimeEnv();
      vi.stubEnv('E2E_TEST_MODE', '');
      mockRateLimitExceeded();
      const { tryHandleAnonymousOnboardingChat } = await import(
        '@/app/api/chat/onboarding-handler'
      );
      const req = makeRequest({
        mode: 'onboarding',
        messages: [userMessage('hi')],
      });
      const result = await tryHandleAnonymousOnboardingChat(req, 'req-rl-1');

      expect(result?.status).toBe(429);
      const body = await result?.json();
      expect(body.errorCode).toBe('RATE_LIMITED');
      expect(hoisted.checkAnonymousChatRateLimitMock).toHaveBeenCalledTimes(1);
      expect(hoisted.executeChatTurnMock).not.toHaveBeenCalled();
    });

    it('skips the limiter entirely when the E2E guard is on', async () => {
      vi.resetModules();
      stubRuntimeEnv();
      vi.stubEnv('E2E_TEST_MODE', '1');
      // Would 429 if it were consulted — the guard must not call it at all.
      mockRateLimitExceeded();
      mockChatTurnOk();
      const { tryHandleAnonymousOnboardingChat } = await import(
        '@/app/api/chat/onboarding-handler'
      );
      const req = makeRequest({
        mode: 'onboarding',
        messages: [userMessage('hi')],
      });
      const result = await tryHandleAnonymousOnboardingChat(req, 'req-rl-2');

      expect(result?.status).toBe(200);
      expect(hoisted.checkAnonymousChatRateLimitMock).not.toHaveBeenCalled();
      expect(hoisted.executeChatTurnMock).toHaveBeenCalledTimes(1);
    });

    it('keeps limiting on production deploys even with E2E_TEST_MODE=1', async () => {
      vi.resetModules();
      stubRuntimeEnv({ nodeEnv: 'production', vercelEnv: 'production' });
      vi.stubEnv('E2E_TEST_MODE', '1');
      hoisted.checkGateForUserMock.mockResolvedValue(true);
      hoisted.isTurnstileConfiguredMock.mockReturnValue(true);
      hoisted.verifyTurnstileTokenMock.mockResolvedValue({ success: true });
      mockRateLimitExceeded();
      const { tryHandleAnonymousOnboardingChat } = await import(
        '@/app/api/chat/onboarding-handler'
      );
      const req = makeRequest({
        mode: 'onboarding',
        turnstileToken: 'tok',
        messages: [userMessage('hi')],
      });
      const result = await tryHandleAnonymousOnboardingChat(req, 'req-rl-3');

      expect(result?.status).toBe(429);
      const body = await result?.json();
      expect(body.errorCode).toBe('RATE_LIMITED');
      expect(hoisted.checkAnonymousChatRateLimitMock).toHaveBeenCalledTimes(1);
      expect(hoisted.executeChatTurnMock).not.toHaveBeenCalled();
    });
  });
});
