import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  buildMobileInboxMock: vi.fn(),
  captureErrorMock: vi.fn(),
  resolveMobileReadyProfileMock: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/mobile/action-loop-inbox', () => ({
  buildMobileInbox: hoisted.buildMobileInboxMock,
}));

vi.mock('@/lib/mobile/ready-profile-route', () => ({
  resolveMobileReadyProfile: hoisted.resolveMobileReadyProfileMock,
}));

const routeModulePromise = import('@/app/api/mobile/v1/inbox/route');

function makeRequest() {
  return new Request('https://jov.ie/api/mobile/v1/inbox', {
    headers: {
      Authorization: 'Bearer session-token',
    },
  });
}

const readyContext = {
  clerkUserId: 'user_123',
  profile: {
    id: 'profile_1',
    username: 'tim',
    usernameNormalized: 'tim',
    displayName: 'Tim White',
    isPublic: true,
    onboardingCompletedAt: new Date('2026-01-01'),
  },
};

const inboxPayload = {
  pendingCount: 1,
  items: [
    {
      id: 'action-1',
      typeLabel: 'Suggestion',
      createdAt: '2026-06-28T10:00:00.000Z',
      title: 'Detroit listeners up 340% — book a show',
      why: 'Promoter email matched your Detroit growth spike.',
      primaryActionLabel: 'Add to calendar',
      status: 'pending' as const,
    },
  ],
  emptyActionCards: [],
  chatPrompt: 'Ask Jovie which revenue opportunities I should act on first.',
};

describe('GET /api/mobile/v1/inbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolveMobileReadyProfileMock.mockResolvedValue({
      ok: true,
      context: readyContext,
    });
    hoisted.buildMobileInboxMock.mockResolvedValue(inboxPayload);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 when profile resolution fails unauthorized', async () => {
    hoisted.resolveMobileReadyProfileMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      }),
    });

    const { GET } = await routeModulePromise;
    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 404 when inbox data cannot be resolved', async () => {
    hoisted.buildMobileInboxMock.mockResolvedValue(null);

    const { GET } = await routeModulePromise;
    const response = await GET(makeRequest());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Profile not found',
    });
  });

  it('returns condensed inbox payload for ready profiles', async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(inboxPayload);
    expect(hoisted.buildMobileInboxMock).toHaveBeenCalledWith('user_123');
  });
});
