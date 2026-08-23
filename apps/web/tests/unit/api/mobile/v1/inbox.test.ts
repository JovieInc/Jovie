import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  buildMobileInboxMock: vi.fn(),
  buildMobileTasteInboxMock: vi.fn(),
  captureErrorMock: vi.fn(),
  resolveMobileReadyProfileMock: vi.fn(),
  checkAdminRoleMock: vi.fn(),
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: hoisted.checkAdminRoleMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/mobile/action-loop-inbox', () => ({
  buildMobileInbox: hoisted.buildMobileInboxMock,
}));

vi.mock('@/lib/mobile/taste-inbox', () => ({
  buildMobileTasteInbox: hoisted.buildMobileTasteInboxMock,
}));

vi.mock('@/lib/mobile/ready-profile-route', () => ({
  resolveMobileReadyProfile: hoisted.resolveMobileReadyProfileMock,
}));

const routeModulePromise = import('@/app/api/mobile/v1/inbox/route');

function makeRequest(workspace?: string) {
  const url = new URL('https://jov.ie/api/mobile/v1/inbox');
  if (workspace) {
    url.searchParams.set('workspace', workspace);
  }
  return new Request(url, {
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
    hoisted.buildMobileTasteInboxMock.mockResolvedValue({
      pendingCount: 1,
      items: [
        {
          id: 'taste:1',
          typeLabel: 'Taste',
          createdAt: '2026-08-03T00:00:00.000Z',
          title: 'JOV-3294 Taste Inbox pane',
          why: 'Needs a founder yes/no.',
          primaryActionLabel: 'Review',
          status: 'pending',
        },
      ],
      emptyActionCards: [],
      chatPrompt: 'Ask Summer which taste cards and stills need a decision.',
    });
    hoisted.checkAdminRoleMock.mockResolvedValue(false);
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
    expect(hoisted.buildMobileTasteInboxMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown workspace', async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(makeRequest('admin'));

    expect(response.status).toBe(400);
    expect(hoisted.buildMobileInboxMock).not.toHaveBeenCalled();
    expect(hoisted.buildMobileTasteInboxMock).not.toHaveBeenCalled();
  });

  it('hides Taste Inbox from non-admins even if they request ov', async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(makeRequest('ov'));

    expect(response.status).toBe(403);
    expect(hoisted.buildMobileInboxMock).not.toHaveBeenCalled();
    expect(hoisted.buildMobileTasteInboxMock).not.toHaveBeenCalled();
  });

  it('returns Taste / stills / cards for admins in ov workspace', async () => {
    hoisted.checkAdminRoleMock.mockResolvedValue(true);

    const { GET } = await routeModulePromise;
    const response = await GET(makeRequest('ov'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(hoisted.buildMobileInboxMock).not.toHaveBeenCalled();
    expect(hoisted.buildMobileTasteInboxMock).toHaveBeenCalledTimes(1);
    expect(data.items[0]?.typeLabel).toBe('Taste');
    expect(data.chatPrompt).toContain('Summer');
  });
});
