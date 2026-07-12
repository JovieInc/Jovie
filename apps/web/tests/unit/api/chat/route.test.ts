import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEntitlements } from '@/lib/entitlements/registry';
// Imported (not re-declared) so the happy-path test can assert on the same
// mock instances installed by the `vi.mock('@/lib/intent-detection', ...)`
// factory below — proves intent routing actually ran and declined.
import {
  classifyIntent,
  isDeterministicIntent,
  routeIntent,
} from '@/lib/intent-detection';

const hoisted = vi.hoisted(() => ({
  tryHandleAnonymousOnboardingChatMock: vi.fn(),
  getOptionalAuthMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  resolveChatAccountContextMock: vi.fn(),
  checkGatesForUserMock: vi.fn(),
  getAppFlagValueMock: vi.fn(),
  checkAiChatRateLimitForPlanMock: vi.fn(),
  executeChatTurnMock: vi.fn(),
  reserveChatTurnMock: vi.fn(),
  persistTerminalAssistantMessageMock: vi.fn(),
}));

vi.mock('@/app/api/chat/onboarding-handler', () => ({
  tryHandleAnonymousOnboardingChat:
    hoisted.tryHandleAnonymousOnboardingChatMock,
}));

vi.mock('@/lib/auth/cached', () => ({
  getOptionalAuth: hoisted.getOptionalAuthMock,
  getCachedAuth: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContextMock,
}));

vi.mock('@/lib/chat/account-context', () => ({
  resolveChatAccountContext: hoisted.resolveChatAccountContextMock,
}));

vi.mock('@/lib/flags/server', () => ({
  checkGatesForUser: hoisted.checkGatesForUserMock,
  getAppFlagValue: hoisted.getAppFlagValueMock,
}));

// resolveAlbumArtCapability/resolveRetouchCapability are SYNCHRONOUS in
// production (apps/web/lib/chat/album-art-capability.ts,
// apps/web/lib/chat/retouch-capability.ts — plain functions, no `async`, no
// awaited call sites in route.ts). Mocking them with `.mockResolvedValue`
// silently returns a Promise instead of the capability object; the route
// never awaits these calls, so any code path that reads
// `albumArtCapability.availability` would see `undefined` on a Promise
// instance rather than the real value. Use `.mockReturnValue` so the mock
// shape matches the real (sync) contract.
vi.mock('@/lib/chat/album-art-capability', () => ({
  resolveAlbumArtCapability: vi.fn().mockReturnValue({
    availability: 'available',
  }),
  detectAlbumArtGenerationIntent: vi.fn().mockReturnValue(false),
  buildAlbumArtUnavailableAssistantMessage: vi
    .fn()
    .mockReturnValue('album art unavailable'),
}));

vi.mock('@/lib/chat/retouch-capability', () => ({
  resolveRetouchCapability: vi.fn().mockReturnValue({
    availability: 'available',
  }),
  detectRetouchIntent: vi.fn().mockReturnValue(false),
  buildRetouchUnavailableAssistantMessage: vi
    .fn()
    .mockReturnValue('retouch unavailable'),
}));

// Keep createRateLimitHeaders REAL so header assertions verify production
// behavior; only the limiter decision itself is controlled by the test.
vi.mock('@/lib/rate-limit', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return {
    ...actual,
    checkAiChatRateLimitForPlan: hoisted.checkAiChatRateLimitForPlanMock,
  };
});

vi.mock('@/lib/chat/run', () => ({
  executeChatTurn: hoisted.executeChatTurnMock,
  isClientDisconnect: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/chat/turns', () => ({
  reserveChatTurn: hoisted.reserveChatTurnMock,
  markChatTurnStreaming: vi.fn(),
  persistTerminalAssistantMessage: hoisted.persistTerminalAssistantMessageMock,
  recordChatTurnModel: vi.fn(),
  TURN_IN_PROGRESS_ERROR_CODE: 'TURN_IN_PROGRESS',
}));

vi.mock('@/lib/db', () => ({
  db: {},
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/eval/scorers/online', () => ({
  scheduleOnlineScoring: vi.fn(),
}));

vi.mock('@/lib/services/album-art/provider-xai', () => ({
  isXaiConfigured: vi.fn().mockReturnValue(false),
  XaiApiKeyMissingError: class XaiApiKeyMissingError extends Error {},
  buildAlbumArtBackgroundPrompt: vi.fn(),
  generateAlbumArtBackgrounds: vi.fn(),
}));

vi.mock('@/lib/services/retouching/provider-gemini', () => ({
  isRetouchConfigured: vi.fn().mockReturnValue(false),
}));

// The modules below are only reached AFTER the guards under test (rate limit,
// auth, kill switch). Mocking them keeps this suite's transform/import cost
// out of gated CI — their graphs add ~30s of cold transform otherwise.
vi.mock('@/lib/intent-detection', () => ({
  classifyIntent: vi.fn().mockReturnValue({ category: 'unknown' }),
  isDeterministicIntent: vi.fn().mockReturnValue(false),
  routeIntent: vi.fn(),
}));

vi.mock('@/lib/merch/service', () => ({
  createMerchGeneration: vi.fn(),
  optimizeMerchCards: vi.fn(),
  reorderMerchCards: vi.fn(),
  selectMerchDesign: vi.fn(),
  showArtistPayouts: vi.fn(),
  showMerchSales: vi.fn(),
  updateMerchCardDetails: vi.fn(),
  updateMerchCardStatus: vi.fn(),
}));

vi.mock('@/lib/services/pitch', () => ({
  buildPitchInput: vi.fn(),
  generatePitchDraft: vi.fn(),
  PITCH_PLATFORMS: [],
  PITCH_TARGET_OPTIONS_TEXT: '',
  PITCH_TARGETS: [],
  resolvePitchDestination: vi.fn(),
}));

vi.mock('@/lib/services/insights/lifecycle', () => ({
  getInsightsSummary: vi.fn(),
}));

vi.mock('@/lib/chat/account-tools', () => ({
  createAccountChatTools: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/services/canvas/service', () => ({
  buildCanvasMetadata: vi.fn(),
  summarizeCanvasStatus: vi.fn(),
}));

vi.mock('@/lib/services/album-art/render', () => ({
  renderAlbumArtCandidate: vi.fn(),
}));

vi.mock('@/lib/services/album-art/storage', () => ({
  uploadAlbumArtCandidate: vi.fn(),
  uploadAlbumArtManifest: vi.fn(),
}));

vi.mock('@/lib/chat/tools/merch-tools', () => ({
  createMerchAlternativeTool: vi.fn(),
  createMerchGenerateTool: vi.fn(),
  createMerchPreviewTool: vi.fn(),
  createMerchSelectTool: vi.fn(),
}));

// decodeToolEvents returns `{ events, source }` in production (see
// DecodedToolEvents in apps/web/lib/chat/tool-events.ts) — both route.ts and
// its own createAssistantReplayStreamResponse() helper immediately read
// `.events` off the result. A bare-array mock return (`[]`) makes `.events`
// resolve to `undefined`, which throws when the replay builder later does
// `for (const event of decodedToolEvents)`. Match the real shape so the
// duplicate_completed replay path (and anything else touching tool events)
// doesn't crash on a harness artifact.
vi.mock('@/lib/chat/tool-events', () => ({
  decodeToolEvents: vi.fn().mockReturnValue({ events: [], source: 'empty' }),
  preparePersistedToolEventsForTurnFinish: vi.fn().mockReturnValue([]),
  resolvePersistedToolEventsForDisplay: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/chat/tools/merch-propose', () => ({
  proposeMerchAction: vi.fn(),
}));

vi.mock('@/lib/chat/tools/propose-video-recording', () => ({
  createProposeVideoRecordingTool: vi.fn(),
}));

vi.mock('@/lib/chat/tools/retouch-image', () => ({
  createRetouchImageTool: vi.fn(),
}));

vi.mock('@/lib/ai/artist-bio-writer', () => ({
  buildArtistBioDraft: vi.fn(),
}));

vi.mock('@/lib/ai/tools/import-bio-from-url', () => ({
  createImportBioFromUrlTool: vi.fn(),
}));

vi.mock('@/lib/ai/tools/profile-edit', () => ({
  createProfileEditTool: vi.fn(),
}));

vi.mock('@/lib/ai/tools/voice-promo', () => ({
  createVoicePromoTool: vi.fn(),
}));

vi.mock('@/lib/chat/releases', () => ({
  fetchReleasesForChat: vi.fn(),
}));

vi.mock('@/lib/chat/release-writes', () => ({
  updateOwnedReleaseGeneratedPitches: vi.fn(),
  updateOwnedReleaseMetadata: vi.fn(),
}));

vi.mock('@/lib/discography/queries', () => ({
  upsertRelease: vi.fn(),
}));

vi.mock('@/lib/discography/slug', () => ({
  generateUniqueSlug: vi.fn(),
}));

const PROFILE_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeAccountContext(
  overrides: Partial<{
    plan: 'free' | 'pro' | 'max';
    billingVerification: 'verified' | 'unavailable';
  }> = {}
) {
  const plan = overrides.plan ?? 'pro';
  const billingVerification = overrides.billingVerification ?? 'verified';
  const planLimits = getEntitlements(plan);
  return {
    email: 'artist@example.com',
    plan,
    displayPlan: plan === 'pro' ? 'Pro' : plan,
    isPro: plan !== 'free',
    billingVerification,
    planMismatch: null,
    usage: null,
    entitlements: {
      aiCanUseTools: plan !== 'free',
      canAccessMerchCreation: plan !== 'free',
      canGenerateAlbumArt: plan !== 'free',
      canAccessAdvancedAnalytics: plan !== 'free',
    },
    flags: { merchMvp: false },
    billing: {
      hasStripeCustomer: plan !== 'free',
      hasStripeSubscription: plan !== 'free',
    },
    merchAccess: { available: plan !== 'free', reason: 'available' },
    planLimits,
    userEntitlements: {
      userId: 'user_123',
      email: 'artist@example.com',
      isAuthenticated: true,
      isAdmin: false,
      plan,
      isPro: plan !== 'free',
      hasAdvancedFeatures: false,
      isTrialing: false,
      trialEndsAt: null,
      trialDaysRemaining: null,
      billingVerification,
      hasStripeCustomer: plan !== 'free',
      hasStripeSubscription: plan !== 'free',
      ...planLimits.booleans,
      ...planLimits.limits,
    },
  };
}

function chatRequest(body: Record<string, unknown>) {
  return new Request('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:3000',
    },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    messages: [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hello' }] },
    ],
    profileId: PROFILE_ID,
    ...overrides,
  };
}

// Satisfies `artistContextSchema` exactly (apps/web/lib/chat/types.ts). Used
// by the happy-path test via the client-provided `artistContext` backward-
// compat branch of `resolveArtistContext`, which never touches `db` (mocked
// to `{}` above) — the `profileId`-driven branch calls the real
// `fetchArtistContext` DB query and is out of scope for this guard-wiring
// suite.
const VALID_ARTIST_CONTEXT = {
  displayName: 'Test Artist',
  username: 'testartist',
  bio: null,
  genres: [] as string[],
  spotifyFollowers: null,
  spotifyPopularity: null,
  spotifyUrl: null,
  appleMusicUrl: null,
  profileViews: 0,
  hasSocialLinks: false,
  hasMusicLinks: false,
  tippingStats: {
    tipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
};

function happyPathBody(overrides: Record<string, unknown> = {}) {
  return {
    messages: [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hello' }] },
    ],
    artistContext: VALID_ARTIST_CONTEXT,
    ...overrides,
  };
}

describe('POST /api/chat guard wiring', () => {
  let POST: typeof import('@/app/api/chat/route')['POST'];

  // The route's import graph is large; pay the transform cost once here
  // instead of inside each test's 5s default timeout.
  beforeAll(async () => {
    ({ POST } = await import('@/app/api/chat/route'));
  }, 120_000);

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.tryHandleAnonymousOnboardingChatMock.mockResolvedValue(null);
    hoisted.getOptionalAuthMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.resolveChatAccountContextMock.mockResolvedValue(
      makeAccountContext()
    );
    hoisted.checkGatesForUserMock.mockResolvedValue([false, false]);
    hoisted.getAppFlagValueMock.mockResolvedValue(false);
    hoisted.checkAiChatRateLimitForPlanMock.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(Date.now() + 60_000),
    });
  });

  it('returns 401 for unauthenticated requests without touching billing, rate limits, or the LLM', async () => {
    hoisted.getOptionalAuthMock.mockResolvedValue({ userId: null });

    const response = await POST(chatRequest(validBody()));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized');
    expect(body.requestId).toBeTruthy();
    expect(response.headers.get('x-request-id')).toBe(body.requestId);

    expect(hoisted.resolveChatAccountContextMock).not.toHaveBeenCalled();
    expect(hoisted.checkAiChatRateLimitForPlanMock).not.toHaveBeenCalled();
    expect(hoisted.executeChatTurnMock).not.toHaveBeenCalled();
  });

  it('returns 400 before charging rate-limit quota when neither profileId nor artistContext is provided', async () => {
    const response = await POST(
      chatRequest(validBody({ profileId: undefined }))
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Missing profileId or artistContext');

    expect(hoisted.checkAiChatRateLimitForPlanMock).not.toHaveBeenCalled();
    expect(hoisted.executeChatTurnMock).not.toHaveBeenCalled();
  });

  it('returns 429 with Retry-After and rate-limit headers when the plan-aware limiter is exhausted, without dispatching the LLM', async () => {
    const reset = new Date(Date.now() + 60_000);
    hoisted.checkAiChatRateLimitForPlanMock.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset,
      reason: 'Daily chat limit reached',
    });

    const response = await POST(chatRequest(validBody()));

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.errorCode).toBe('RATE_LIMITED');
    expect(body.message).toBe('Daily chat limit reached');
    expect(body.retryAfter).toBeGreaterThan(0);
    expect(body.retryAfter).toBeLessThanOrEqual(60);

    // Headers come from the REAL createRateLimitHeaders — verifies the
    // route forwards the limiter result into production header shape.
    const retryAfterHeader = Number(response.headers.get('Retry-After'));
    expect(retryAfterHeader).toBeGreaterThan(0);
    expect(retryAfterHeader).toBeLessThanOrEqual(60);
    expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');

    // Wiring: the limiter must be consulted with the canonical userId + plan
    // from the entitlement resolver, not values from the request body.
    expect(hoisted.checkAiChatRateLimitForPlanMock).toHaveBeenCalledWith(
      'user_123',
      'pro'
    );
    expect(hoisted.executeChatTurnMock).not.toHaveBeenCalled();
    expect(hoisted.reserveChatTurnMock).not.toHaveBeenCalled();
  });

  it('overrides the 429 message when billing verification is unavailable', async () => {
    hoisted.resolveChatAccountContextMock.mockResolvedValue(
      makeAccountContext({ billingVerification: 'unavailable' })
    );
    hoisted.checkAiChatRateLimitForPlanMock.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
      reason: 'Daily chat limit reached',
    });

    const response = await POST(chatRequest(validBody()));

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.errorCode).toBe('RATE_LIMITED');
    // The billing-degraded branch replaces the limiter reason with the
    // billing-specific guidance message.
    expect(body.message).not.toBe('Daily chat limit reached');
    expect(body.message).toMatch(/billing/i);
  });

  it('returns 503 with CHAT_DISABLED when the kill switch gate is on, before rate limiting', async () => {
    hoisted.checkGatesForUserMock.mockResolvedValue([true, false]);

    const response = await POST(chatRequest(validBody()));

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.errorCode).toBe('CHAT_DISABLED');

    expect(hoisted.checkAiChatRateLimitForPlanMock).not.toHaveBeenCalled();
    expect(hoisted.executeChatTurnMock).not.toHaveBeenCalled();
  });

  describe('happy-path 200 wiring', () => {
    function mockSuccessfulTurn() {
      const fakeResponse = new Response('mock-stream-body', {
        status: 200,
        headers: { 'x-mock-stream': 'true' },
      });
      const toUIMessageStreamResponseMock = vi
        .fn()
        .mockReturnValue(fakeResponse);
      hoisted.executeChatTurnMock.mockResolvedValue({
        streamResult: {
          toUIMessageStreamResponse: toUIMessageStreamResponseMock,
        },
        selectedModel: 'anthropic/claude-happy-path-test',
        systemPrompt: 'test system prompt',
        toolNames: ['proposeAvatarUpload'],
        modelMessages: [],
        turnSignals: { toolStepCapExhausted: false },
      });
      return { fakeResponse, toUIMessageStreamResponseMock };
    }

    it('wires guards in order — resolveChatAccountContext -> checkAiChatRateLimitForPlan -> intent routing (declines) -> executeChatTurn — and dispatches with resolved-context/plan-derived args, never request-body values', async () => {
      const accountContext = makeAccountContext();
      hoisted.resolveChatAccountContextMock.mockResolvedValue(accountContext);
      const { fakeResponse, toUIMessageStreamResponseMock } =
        mockSuccessfulTurn();

      const response = await POST(chatRequest(happyPathBody()));

      // 200 + the exact Response produced by the mocked executeChatTurn's
      // streamResult — proves the route returns it directly, unwrapped.
      expect(response).toBe(fakeResponse);
      expect(response.status).toBe(200);
      expect(response.headers.get('x-mock-stream')).toBe('true');

      // --- Call order: resolveChatAccountContext -> checkAiChatRateLimitForPlan
      //     -> classifyIntent/isDeterministicIntent (intent routing declines,
      //     routeIntent never called) -> executeChatTurn.
      const accountContextOrder =
        hoisted.resolveChatAccountContextMock.mock.invocationCallOrder[0];
      const rateLimitOrder =
        hoisted.checkAiChatRateLimitForPlanMock.mock.invocationCallOrder[0];
      const classifyIntentOrder =
        vi.mocked(classifyIntent).mock.invocationCallOrder[0];
      const isDeterministicIntentOrder = vi.mocked(isDeterministicIntent).mock
        .invocationCallOrder[0];
      const executeChatTurnOrder =
        hoisted.executeChatTurnMock.mock.invocationCallOrder[0];

      expect(accountContextOrder).toBeLessThan(rateLimitOrder);
      expect(rateLimitOrder).toBeLessThan(classifyIntentOrder);
      expect(classifyIntentOrder).toBeLessThan(isDeterministicIntentOrder);
      expect(isDeterministicIntentOrder).toBeLessThan(executeChatTurnOrder);

      // Intent routing ran and declined — routeIntent (the actual dispatch)
      // must never be called, proving the LLM path (not deterministic CRUD)
      // handled this turn.
      expect(vi.mocked(classifyIntent)).toHaveBeenCalledWith('hello');
      expect(vi.mocked(isDeterministicIntent)).toHaveBeenCalledWith({
        category: 'unknown',
      });
      expect(vi.mocked(routeIntent)).not.toHaveBeenCalled();

      // Rate limiter consulted with the canonical userId + plan (not request
      // body values — the request body carries no userId/plan at all here).
      expect(hoisted.checkAiChatRateLimitForPlanMock).toHaveBeenCalledWith(
        'user_123',
        'pro'
      );

      // --- executeChatTurn receives the resolved account context and
      //     plan-derived state, not raw request-body values.
      expect(hoisted.executeChatTurnMock).toHaveBeenCalledTimes(1);
      const turnArgs = hoisted.executeChatTurnMock.mock.calls[0][0];
      expect(turnArgs.userId).toBe('user_123');
      expect(turnArgs.userPlan).toBe('pro');
      expect(turnArgs.accountContext).toBe(accountContext);
      expect(turnArgs.planLimits).toBe(accountContext.planLimits);
      expect(turnArgs.artistContext).toEqual(VALID_ARTIST_CONTEXT);
      expect(turnArgs.releases).toEqual([]);
      // No profileId in the request body — the client-provided artistContext
      // backward-compat branch resolves a null internal profile id.
      expect(turnArgs.resolvedProfileId).toBeNull();
      expect(turnArgs.resolvedConversationId).toBeNull();
      expect(turnArgs.lastUserText).toBe('hello');
      expect(turnArgs.forceLightModel).toBe(false);
      expect(turnArgs.modelRotationStep).toBe(0);
      expect(turnArgs.pinnedOpportunity).toBeNull();
      expect(turnArgs.requestId).toBeTruthy();
      expect(typeof turnArgs.signal).toBe('object');

      // Tool set is derived from the resolved plan/account context, not the
      // request body (`ChatRequestBody` has no `tools` field at all — see
      // apps/web/lib/chat/request-validation.ts). Pro plan + verified billing
      // => paid tools merged with the always-on free tools.
      const toolNames = Object.keys(turnArgs.tools).sort();
      expect(toolNames).toEqual(
        expect.arrayContaining([
          // Free tools (present on every plan)
          'proposeAvatarUpload',
          'proposeSocialLink',
          'proposeSocialLinkRemoval',
          'submitFeedback',
          // Paid-plan-only tools — presence proves the set was expanded
          // server-side from the resolved plan, not from the request.
          'proposeProfileEdit',
          'showTopInsights',
          'createMerch',
        ])
      );
      // Gated off given default flags/state in this scenario: no profileId
      // (createRelease/generateReleasePitch need one), album art + teleprompter
      // feature flags default false via getAppFlagValueMock.
      expect(toolNames).not.toContain('createRelease');
      expect(toolNames).not.toContain('generateReleasePitch');
      expect(toolNames).not.toContain('generateAlbumArt');
      expect(toolNames).not.toContain('proposeVideoRecording');

      // --- Response wiring: headers passed to toUIMessageStreamResponse
      //     reflect requestId + CORS, and (with no reserved turn) omit
      //     conversation/turn headers and messageMetadata.
      expect(toUIMessageStreamResponseMock).toHaveBeenCalledTimes(1);
      const streamCallArgs = toUIMessageStreamResponseMock.mock.calls[0][0];
      expect(streamCallArgs.headers['x-request-id']).toBe(turnArgs.requestId);
      expect(streamCallArgs.headers['x-conversation-id']).toBeUndefined();
      expect(streamCallArgs.headers['x-chat-turn-id']).toBeUndefined();
      expect(streamCallArgs.messageMetadata()).toBeUndefined();

      expect(hoisted.reserveChatTurnMock).not.toHaveBeenCalled();
    });
  });

  describe('duplicate clientTurnId handling (idempotency gate)', () => {
    const EXISTING_TURN = {
      id: 'turn_existing_1',
      userId: 'user_internal_1',
      creatorProfileId: PROFILE_ID,
      conversationId: 'conv_existing_1',
      clientTurnId: 'client-turn-duplicate-1',
      status: 'streaming' as const,
      source: 'typed' as const,
      model: null,
      toolIntent: null,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:05.000Z'),
      startedAt: new Date('2026-01-01T00:00:01.000Z'),
      completedAt: null,
    };

    function duplicateTurnBody(overrides: Record<string, unknown> = {}) {
      return validBody({
        clientTurnId: EXISTING_TURN.clientTurnId,
        ...overrides,
      });
    }

    beforeEach(() => {
      hoisted.getSessionContextMock.mockResolvedValue({
        user: { id: 'user_internal_1' },
        profile: { id: PROFILE_ID },
      });
    });

    it('returns 409 with the in-progress turn/conversation identifiers, and short-circuits before quota is charged or the LLM is dispatched', async () => {
      hoisted.reserveChatTurnMock.mockResolvedValue({
        outcome: 'duplicate_in_progress',
        conversationId: EXISTING_TURN.conversationId,
        turn: EXISTING_TURN,
      });

      const response = await POST(chatRequest(duplicateTurnBody()));

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error).toBe('TURN_IN_PROGRESS');
      expect(body.errorCode).toBe('TURN_IN_PROGRESS');
      expect(body.conversationId).toBe(EXISTING_TURN.conversationId);
      expect(body.turnId).toBe(EXISTING_TURN.id);
      expect(body.requestId).toBeTruthy();

      // Headers surface the existing turn/conversation for client replay
      // polling, alongside the standard request-id header.
      expect(response.headers.get('x-conversation-id')).toBe(
        EXISTING_TURN.conversationId
      );
      expect(response.headers.get('x-chat-turn-id')).toBe(EXISTING_TURN.id);
      expect(response.headers.get('x-request-id')).toBe(body.requestId);

      // Idempotency gate: reservation is consulted (and short-circuits)
      // BEFORE quota is charged and before the LLM is ever dispatched — a
      // retried duplicate must not cost the artist a rate-limit unit or spin
      // up a redundant model call.
      expect(hoisted.checkAiChatRateLimitForPlanMock).not.toHaveBeenCalled();
      expect(hoisted.executeChatTurnMock).not.toHaveBeenCalled();
      expect(
        hoisted.persistTerminalAssistantMessageMock
      ).not.toHaveBeenCalled();

      // Session resolved from the authenticated userId (not request body),
      // and the reservation call carries the resolved session identity plus
      // the request-derived turn fields — not raw request-body passthrough.
      expect(hoisted.getSessionContextMock).toHaveBeenCalledWith({
        clerkUserId: 'user_123',
        requireProfile: true,
      });
      expect(hoisted.reserveChatTurnMock).toHaveBeenCalledTimes(1);
      expect(hoisted.reserveChatTurnMock).toHaveBeenCalledWith({
        conversationId: null,
        clientTurnId: EXISTING_TURN.clientTurnId,
        clientMessageId: null,
        source: 'typed',
        toolIntent: null,
        userMessage: 'hello',
        userId: 'user_internal_1',
        creatorProfileId: PROFILE_ID,
      });
    });

    describe('duplicate_completed replay path', () => {
      // route.ts ~2600-2635: when reserveChatTurn resolves 'duplicate_completed'
      // the route must replay the already-persisted turn instead of dispatching
      // a fresh LLM call — the whole point being that a retried request for a
      // turn that already finished costs zero quota and zero model calls.
      function userMessage() {
        return {
          id: 'msg_user_1',
          conversationId: EXISTING_TURN.conversationId,
          turnId: EXISTING_TURN.id,
          clientMessageId: EXISTING_TURN.clientTurnId,
          role: 'user' as const,
          content: 'hello',
          toolCalls: null,
          assistantSource: null,
          scriptLineKey: null,
          createdAt: new Date('2026-01-01T00:00:02.000Z'),
        };
      }

      function assistantMessage(
        overrides: Partial<{ content: string; toolCalls: unknown }> = {}
      ) {
        return {
          id: 'msg_assistant_1',
          conversationId: EXISTING_TURN.conversationId,
          turnId: EXISTING_TURN.id,
          clientMessageId: null,
          role: 'assistant' as const,
          content: 'Done! I updated your bio.',
          toolCalls: null,
          assistantSource: 'llm',
          scriptLineKey: null,
          createdAt: new Date('2026-01-01T00:00:04.000Z'),
          ...overrides,
        };
      }

      it('replays the persisted assistant content instead of re-running the LLM, and never re-charges quota or dispatches a new turn', async () => {
        const completedTurn = {
          ...EXISTING_TURN,
          status: 'completed' as const,
        };
        hoisted.reserveChatTurnMock.mockResolvedValue({
          outcome: 'duplicate_completed',
          conversationId: completedTurn.conversationId,
          turn: completedTurn,
          messages: [userMessage(), assistantMessage()],
        });

        const response = await POST(chatRequest(duplicateTurnBody()));

        // Status/headers: replay is a normal 200 stream, tagged so the client
        // can distinguish "here's what already happened" from a live turn.
        expect(response.status).toBe(200);
        expect(response.headers.get('x-chat-replay')).toBe('true');
        expect(response.headers.get('x-conversation-id')).toBe(
          completedTurn.conversationId
        );
        expect(response.headers.get('x-chat-turn-id')).toBe(completedTurn.id);
        const requestId = response.headers.get('x-request-id');
        expect(requestId).toBeTruthy();

        const body = await response.text();
        // The replay carries the ORIGINAL turn's content verbatim — proves
        // this is a replay, not a freshly generated model response.
        expect(body).toContain('"type":"text-delta"');
        expect(body).toContain('"delta":"Done! I updated your bio."');
        // Metadata on the stream pins the replayed turn/conversation/request ids.
        expect(body).toContain(
          `"conversationId":"${completedTurn.conversationId}"`
        );
        expect(body).toContain(`"turnId":"${completedTurn.id}"`);
        expect(body).toContain(`"requestId":"${requestId}"`);
        expect(body).toContain('"type":"finish"');
        expect(body).not.toContain('"type":"error"');

        // The whole point of the replay path: no new LLM turn, no quota burn,
        // no second terminal-message write (the message already exists).
        expect(hoisted.checkAiChatRateLimitForPlanMock).not.toHaveBeenCalled();
        expect(hoisted.executeChatTurnMock).not.toHaveBeenCalled();
        expect(
          hoisted.persistTerminalAssistantMessageMock
        ).not.toHaveBeenCalled();

        expect(hoisted.reserveChatTurnMock).toHaveBeenCalledTimes(1);
        expect(hoisted.reserveChatTurnMock).toHaveBeenCalledWith({
          conversationId: null,
          clientTurnId: EXISTING_TURN.clientTurnId,
          clientMessageId: null,
          source: 'typed',
          toolIntent: null,
          userMessage: 'hello',
          userId: 'user_internal_1',
          creatorProfileId: PROFILE_ID,
        });
      });

      it('falls back to the terminal-turn notice when the completed turn has no persisted assistant message, and still skips billing + the LLM', async () => {
        const failedTurn = {
          ...EXISTING_TURN,
          status: 'failed_model_error' as const,
        };
        hoisted.reserveChatTurnMock.mockResolvedValue({
          outcome: 'duplicate_completed',
          conversationId: failedTurn.conversationId,
          turn: failedTurn,
          // No assistant row was ever persisted for this turn (e.g. it failed
          // before the model responded) — `.find(role === 'assistant')` finds
          // nothing, and with no persisted tool state either, the route must
          // fall back to the generic "already finished" notice rather than
          // replaying empty/undefined content.
          messages: [userMessage()],
        });

        const response = await POST(chatRequest(duplicateTurnBody()));

        expect(response.status).toBe(200);
        expect(response.headers.get('x-chat-replay')).toBe('true');
        expect(response.headers.get('x-chat-turn-id')).toBe(failedTurn.id);

        const body = await response.text();
        expect(body).toContain(
          '"delta":"This chat action already finished. Please send a new message if you need anything else."'
        );
        expect(body).toContain('"type":"finish"');
        expect(body).not.toContain('"type":"error"');

        expect(hoisted.checkAiChatRateLimitForPlanMock).not.toHaveBeenCalled();
        expect(hoisted.executeChatTurnMock).not.toHaveBeenCalled();
      });
    });
  });
});
