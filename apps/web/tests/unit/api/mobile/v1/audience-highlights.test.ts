import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  buildMobileAudienceHighlightsMock: vi.fn(),
  captureErrorMock: vi.fn(),
  getMobileSessionUserIdMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  isProfileCompleteMock: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/mobile/audience-highlights', () => ({
  buildMobileAudienceHighlights: hoisted.buildMobileAudienceHighlightsMock,
}));

vi.mock('@/lib/mobile/session-auth', () => ({
  getMobileSessionUserId: hoisted.getMobileSessionUserIdMock,
}));

vi.mock('@/lib/auth/profile-completeness', () => ({
  isProfileComplete: hoisted.isProfileCompleteMock,
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContextMock,
  SESSION_ERRORS: {
    USER_NOT_FOUND: 'User not found',
  },
}));

const routeModulePromise = import(
  '@/app/api/mobile/v1/audience/highlights/route'
);

function makeRequest() {
  return new Request('https://jov.ie/api/mobile/v1/audience/highlights', {
    headers: {
      Authorization: 'Bearer session-token',
    },
  });
}

const readyProfile = {
  id: 'profile_1',
  username: 'tim',
  usernameNormalized: 'tim',
  displayName: 'Tim White',
  isPublic: true,
  onboardingCompletedAt: new Date('2026-01-01'),
};

const highlightsPayload = {
  rangeLabel: 'Last 7 days',
  heroLabel: 'Profile views',
  heroValue: 1284,
  heroDeltaLabel: '+18% vs last week',
  statTiles: [
    { label: 'Unique fans', value: 963 },
    { label: 'Subscribed fans', value: 531, hint: '55% of fans' },
    { label: 'Link clicks', value: 893 },
    { label: 'Listen clicks', value: 342 },
  ],
  chatPrompt: 'Ask Jovie about my audience trends and who is engaging most.',
};

describe('GET /api/mobile/v1/audience/highlights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getMobileSessionUserIdMock.mockResolvedValue('user_123');
    hoisted.getSessionContextMock.mockResolvedValue({
      user: { userStatus: 'active' },
      profile: readyProfile,
    });
    hoisted.isProfileCompleteMock.mockReturnValue(true);
    hoisted.buildMobileAudienceHighlightsMock.mockResolvedValue(
      highlightsPayload
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getMobileSessionUserIdMock.mockResolvedValue(null);

    const { GET } = await routeModulePromise;
    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    });
  });

  it('returns 404 when profile is missing', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      user: { userStatus: 'active' },
      profile: null,
    });

    const { GET } = await routeModulePromise;
    const response = await GET(makeRequest());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Profile not found',
    });
  });

  it('returns 404 when profile is incomplete', async () => {
    hoisted.isProfileCompleteMock.mockReturnValue(false);

    const { GET } = await routeModulePromise;
    const response = await GET(makeRequest());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Profile incomplete',
    });
  });

  it('returns condensed audience highlights for ready profiles', async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(highlightsPayload);
    expect(hoisted.buildMobileAudienceHighlightsMock).toHaveBeenCalledWith(
      'user_123'
    );
  });
});
