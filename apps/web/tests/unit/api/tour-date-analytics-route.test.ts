import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockRequireAuth,
  mockGetSessionContext,
  mockDbSelect,
  mockGetTourDateAnalytics,
  mockCaptureException,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockGetSessionContext: vi.fn(),
  mockDbSelect: vi.fn(),
  mockGetTourDateAnalytics: vi.fn(),
  mockCaptureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth/session', () => ({
  requireAuth: mockRequireAuth,
  getSessionContext: mockGetSessionContext,
}));

vi.mock('@/lib/db', () => {
  const mockLimit = vi.fn();
  const mockWhere = vi.fn(() => ({ limit: mockLimit }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  mockDbSelect.mockImplementation(() => {
    const chain = mockSelect();
    // Store references for test assertions
    (chain as Record<string, unknown>).__where = mockWhere;
    (chain as Record<string, unknown>).__limit = mockLimit;
    return chain;
  });
  return {
    db: {
      select: (...args: unknown[]) => mockDbSelect(...args),
    },
  };
});

vi.mock('@/lib/db/queries/analytics', () => ({
  getTourDateAnalytics: mockGetTourDateAnalytics,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: mockCaptureException,
}));

vi.mock('@/lib/db/schema/tour', () => ({ tourDates: {} }));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
}));

// ---------------------------------------------------------------------------
// Import the route handler
// ---------------------------------------------------------------------------

const { GET } = await import(
  '@/app/api/dashboard/tour-dates/[id]/analytics/route'
);

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

function makeRequest() {
  return new Request(
    'http://localhost/api/dashboard/tour-dates/test/analytics'
  );
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/dashboard/tour-dates/[id]/analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const response = await GET(makeRequest(), makeParams(VALID_UUID));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 for invalid UUID format', async () => {
    mockRequireAuth.mockResolvedValue('user_123');

    const response = await GET(makeRequest(), makeParams('not-a-uuid'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid tour date ID');
  });

  it('returns 400 for empty ID', async () => {
    mockRequireAuth.mockResolvedValue('user_123');

    const response = await GET(makeRequest(), makeParams(''));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid tour date ID');
  });

  it('returns 404 when creator profile not found', async () => {
    mockRequireAuth.mockResolvedValue('user_123');
    mockGetSessionContext.mockResolvedValue({
      clerkUserId: 'user_123',
      user: { id: 'db_user_1' },
      profile: null,
    });

    const response = await GET(makeRequest(), makeParams(VALID_UUID));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Creator profile not found');
  });

  it('returns 404 when tour date not found or not owned', async () => {
    mockRequireAuth.mockResolvedValue('user_123');
    mockGetSessionContext.mockResolvedValue({
      clerkUserId: 'user_123',
      user: { id: 'db_user_1' },
      profile: { id: 'profile_123' },
    });
    // db.select chain returns empty array (no tour date found)
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    });

    const response = await GET(makeRequest(), makeParams(VALID_UUID));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Tour date not found');
  });

  it('returns analytics data for valid request', async () => {
    mockRequireAuth.mockResolvedValue('user_123');
    mockGetSessionContext.mockResolvedValue({
      clerkUserId: 'user_123',
      user: { id: 'db_user_1' },
      profile: { id: 'profile_123' },
    });
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([{ id: VALID_UUID }])),
        })),
      })),
    });
    const analyticsResult = {
      ticketClicks: 42,
      topCities: [{ city: 'Los Angeles', count: 15 }],
      topReferrers: [{ referrer: 'instagram.com', count: 8 }],
    };
    mockGetTourDateAnalytics.mockResolvedValue(analyticsResult);

    const response = await GET(makeRequest(), makeParams(VALID_UUID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(analyticsResult);
    expect(mockGetTourDateAnalytics).toHaveBeenCalledWith(
      VALID_UUID,
      'profile_123'
    );
  });

  it('returns 500 and captures to Sentry on unexpected error', async () => {
    mockRequireAuth.mockResolvedValue('user_123');
    mockGetSessionContext.mockRejectedValue(new Error('DB connection lost'));

    const response = await GET(makeRequest(), makeParams(VALID_UUID));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch tour date analytics');
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('sets no-store cache headers on all responses', async () => {
    mockRequireAuth.mockResolvedValue('user_123');
    mockGetSessionContext.mockResolvedValue({
      clerkUserId: 'user_123',
      user: { id: 'db_user_1' },
      profile: null,
    });

    const response = await GET(makeRequest(), makeParams(VALID_UUID));

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
