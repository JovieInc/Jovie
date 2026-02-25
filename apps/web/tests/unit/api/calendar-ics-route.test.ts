import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/calendar/[eventId]/route';

const { mockEq, mockCaptureError, mockAfter } = vi.hoisted(() => ({
  mockEq: vi.fn(),
  mockCaptureError: vi.fn(),
  mockAfter: vi.fn((cb: () => void) => cb()),
}));

const { db } = vi.hoisted(() => {
  const limit = vi.fn();
  const whereResult = { limit };
  const where = vi.fn(() => whereResult);
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
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
  },
}));

vi.mock('@/lib/db/schema/tour', () => ({
  tourDates: {
    id: 'id',
    profileId: 'profile_id',
    startDate: 'start_date',
    venueName: 'venue_name',
    city: 'city',
    region: 'region',
    country: 'country',
    startTime: 'start_time',
    ticketUrl: 'ticket_url',
    title: 'title',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('next/server', async importOriginal => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: mockAfter,
  };
});

const VALID_EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('GET /api/calendar/[eventId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCaptureError.mockResolvedValue(undefined);
  });

  it('returns 400 when eventId is malformed', async () => {
    const request = new NextRequest('https://jov.ie/api/calendar/not-a-uuid');

    const response = await GET(request, {
      params: Promise.resolve({ eventId: 'not-a-uuid' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid event ID format',
    });
  });

  it('returns 404 when event is not found', async () => {
    db.select().from().innerJoin().where().limit.mockResolvedValue([]);

    const request = new NextRequest(
      `https://jov.ie/api/calendar/${VALID_EVENT_ID}`
    );

    const response = await GET(request, {
      params: Promise.resolve({ eventId: VALID_EVENT_ID }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Event not found',
    });
  });

  it('calls captureError with route and eventId context on DB failure', async () => {
    const dbError = new Error('database is down');
    db.select().from().innerJoin().where().limit.mockRejectedValue(dbError);

    const request = new NextRequest(
      `https://jov.ie/api/calendar/${VALID_EVENT_ID}`
    );

    const response = await GET(request, {
      params: Promise.resolve({ eventId: VALID_EVENT_ID }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal Server Error',
    });
    expect(mockAfter).toHaveBeenCalledOnce();
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Calendar ICS generation failed',
      dbError,
      {
        route: '/api/calendar/[eventId]',
        eventId: VALID_EVENT_ID,
      }
    );
  });

  it('returns 200 with text/calendar content for valid event', async () => {
    db.select()
      .from()
      .innerJoin()
      .where()
      .limit.mockResolvedValue([
        {
          tourDate: {
            id: VALID_EVENT_ID,
            startDate: '2026-06-15T20:00:00Z',
            venueName: 'Madison Square Garden',
            city: 'New York',
            region: 'NY',
            country: 'US',
            startTime: '8:00 PM',
            ticketUrl: 'https://tickets.example.com',
            title: 'Summer Tour',
            profileId: 'profile-1',
          },
          profile: {
            displayName: 'Test Artist',
            username: 'testartist',
          },
        },
      ]);

    const request = new NextRequest(
      `https://jov.ie/api/calendar/${VALID_EVENT_ID}`
    );

    const response = await GET(request, {
      params: Promise.resolve({ eventId: VALID_EVENT_ID }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'text/calendar; charset=utf-8'
    );

    const body = await response.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('END:VCALENDAR');
    expect(body).toContain('Test Artist');
    expect(body).toContain('Madison Square Garden');
  });
});
