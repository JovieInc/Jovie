import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatAccountContext } from '@/lib/chat/account-context';
import { getEntitlements } from '@/lib/entitlements/registry';

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

vi.mock('@/lib/chat/tool-events', () => ({
  decodeToolEvents: vi.fn().mockReturnValue([]),
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
): ChatAccountContext {
  const billingVerification = overrides.billingVerification ?? 'verified';
  const plan =
    billingVerification === 'unavailable' ? 'free' : (overrides.plan ?? 'pro');
  const planLimits = getEntitlements(plan);
  const isPro = plan !== 'free';
  const merchAvailable = billingVerification === 'verified' && isPro;
  const displayPlan =
    billingVerification === 'unavailable'
      ? 'Unverified'
      : plan === 'max'
        ? 'Max'
        : plan === 'pro'
          ? 'Pro'
          : 'Free';
  return {
    email: 'artist@example.com',
    plan,
    displayPlan,
    isPro,
    billingVerification,
    planMismatch: null,
    usage: null,
    entitlements: {
      aiCanUseTools: planLimits.booleans.aiCanUseTools,
      canAccessMerchCreation: planLimits.booleans.canAccessMerchCreation,
      canGenerateAlbumArt: planLimits.booleans.canGenerateAlbumArt,
      canAccessAdvancedAnalytics:
        planLimits.booleans.canAccessAdvancedAnalytics,
    },
    flags: { merchMvp: false },
    billing: {
      hasStripeCustomer: isPro,
      hasStripeSubscription: isPro,
    },
    merchAccess: {
      available: merchAvailable,
      reason:
        billingVerification === 'unavailable'
          ? 'billing_unavailable'
          : merchAvailable
            ? 'available'
            : 'plan_unavailable',
    },
    planLimits,
    userEntitlements: {
      userId: 'user_123',
      email: 'artist@example.com',
      isAuthenticated: true,
      isAdmin: false,
      plan,
      isPro,
      hasAdvancedFeatures: false,
      isTrialing: false,
      trialEndsAt: null,
      trialDaysRemaining: null,
      billingVerification,
      hasStripeCustomer: isPro,
      hasStripeSubscription: isPro,
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
    expect(hoisted.checkAiChatRateLimitForPlanMock).toHaveBeenCalledWith(
      'user_123',
      'free'
    );
  });

  it('returns 503 with CHAT_DISABLED when the kill switch gate is on, before rate limiting', async () => {
    hoisted.checkGatesForUserMock.mockResolvedValue([true, false]);

    const response = await POST(chatRequest(validBody()));

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.errorCode).toBe('CHAT_DISABLED');

    expect(hoisted.checkGatesForUserMock).toHaveBeenCalledWith('user_123', [
      { key: 'ai_chat_disabled', defaultValue: false },
      { key: 'ai_chat_force_light', defaultValue: false },
    ]);
    expect(hoisted.checkAiChatRateLimitForPlanMock).not.toHaveBeenCalled();
    expect(hoisted.executeChatTurnMock).not.toHaveBeenCalled();
  });
});
