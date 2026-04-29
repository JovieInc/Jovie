import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/calendar/profile/[username]/route';

const {
  mockEq,
  mockCaptureError,
  mockAfter,
  mockLimit,
  mockRateLimit,
  mockCreateRateLimitHeaders,
  mockGetConfirmedTourEventsForProfile,
} = vi.hoisted(() => ({
  mockEq: vi.fn(),
  mockCaptureError: vi.fn(),
  mockAfter: vi.fn((cb: () => void) => cb()),
  mockLimit: vi.fn(),
  mockRateLimit: vi.fn(),
  mockCreateRateLimitHeaders: vi.fn(),
  mockGetConfirmedTourEventsForProfile: vi.fn(),
}));

const { db } = vi.hoisted(() => {
  const limit = mockLimit;
  const whereResult = { limit };
  const where = vi.fn(() => whereResult);
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  return {
    db: {
      select,
    },
  };
});

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
}));

vi.mock('@/lib/db', () => ({
  db,
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'profile_id',
    displayName: 'display_name',
    username: 'username',
    usernameNormalized: 'username_normalized',
    isPublic: 'is_public',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/rate-limit', () => ({
  apiLimiter: {
    limit: mockRateLimit,
  },
  createRateLimitHeaders: mockCreateRateLimitHeaders,
}));

vi.mock('@/lib/tour-dates/queries', () => ({
  getConfirmedTourEventsForProfile: mockGetConfirmedTourEventsForProfile,
}));

vi.mock('next/server', async importOriginal => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: mockAfter,
  };
});

describe('GET /api/calendar/profile/[username]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCaptureError.mockResolvedValue(undefined);
    mockRateLimit.mockResolvedValue({ success: true });
    mockCreateRateLimitHeaders.mockReturnValue({});
  });

  it('escapes multi-line event descriptions as ICS line breaks', async () => {
    mockLimit.mockResolvedValue([
      {
        id: 'profile-1',
        displayName: 'Test Artist',
        username: 'testartist',
        usernameNormalized: 'testartist',
        isPublic: true,
      },
    ]);
    mockGetConfirmedTourEventsForProfile.mockResolvedValue([
      {
        id: 'event-1',
        startDate: '2026-06-15T20:00:00Z',
        venueName: 'The Forum',
        city: 'Los Angeles',
        region: 'CA',
        country: 'US',
        startTime: '7:00 PM',
        ticketUrl: 'https://tickets.example.com/show',
        title: 'Summer Tour',
      },
    ]);

    const request = new NextRequest(
      'https://jov.ie/api/calendar/profile/testartist'
    );

    const response = await GET(request, {
      params: Promise.resolve({ username: 'testartist' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'text/calendar; charset=utf-8'
    );

    const body = await response.text();
    expect(body).toContain(
      'DESCRIPTION:Test Artist live at The Forum\\nDoors: 7:00 PM\\nTickets: https://tickets.example.com/show'
    );
    expect(body).toContain('URL:https://tickets.example.com/show');
  });
});
