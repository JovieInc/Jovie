import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  buildMobileCalendarMock: vi.fn(),
  captureErrorMock: vi.fn(),
  resolveMobileReadyProfileMock: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/mobile/action-loop-calendar', () => ({
  buildMobileCalendar: hoisted.buildMobileCalendarMock,
}));

vi.mock('@/lib/mobile/ready-profile-route', () => ({
  resolveMobileReadyProfile: hoisted.resolveMobileReadyProfileMock,
}));

const routeModulePromise = import('@/app/api/mobile/v1/calendar/route');

function makeRequest() {
  return new Request('https://jov.ie/api/mobile/v1/calendar', {
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

const calendarPayload = {
  rangeLabel: 'Upcoming',
  pendingReviewCount: 1,
  upcomingEvents: [
    {
      id: 'event-1',
      title: 'Brooklyn show',
      subtitle: 'Brooklyn, NY · Bandsintown',
      eventDate: '2026-07-10T20:00:00.000Z',
      eventType: 'tour',
      confirmationStatus: 'pending',
    },
  ],
  pendingEvents: [
    {
      id: 'event-1',
      title: 'Brooklyn show',
      subtitle: 'Brooklyn, NY · Bandsintown',
      eventDate: '2026-07-10T20:00:00.000Z',
      eventType: 'tour',
      confirmationStatus: 'pending',
    },
  ],
  upcomingReleases: [
    {
      id: 'release-1',
      title: 'Midnight Drive',
      releaseDate: '2026-08-01T00:00:00.000Z',
      status: 'scheduled',
      artworkUrl: 'https://cdn.example/art.jpg',
    },
  ],
  chatPrompt: 'Ask Jovie what I should prioritize on my calendar this week.',
};

describe('GET /api/mobile/v1/calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolveMobileReadyProfileMock.mockResolvedValue({
      ok: true,
      context: readyContext,
    });
    hoisted.buildMobileCalendarMock.mockResolvedValue(calendarPayload);
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

  it('returns condensed calendar payload for ready profiles', async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(calendarPayload);
    expect(hoisted.buildMobileCalendarMock).toHaveBeenCalledWith('profile_1');
  });
});