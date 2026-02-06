import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks
const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockEnqueueBulkClaimInviteJobs = vi.hoisted(() => vi.fn());
const mockWithSystemIngestionSession = vi.hoisted(() => vi.fn());
const mockFetchProfilesById = vi.hoisted(() => vi.fn());
const mockFetchProfilesByFitScore = vi.hoisted(() => vi.fn());
const mockFetchEligibleProfilesForPreview = vi.hoisted(() => vi.fn());
const mockGetEligibleProfileCount = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/email/jobs/enqueue', () => ({
  enqueueBulkClaimInviteJobs: mockEnqueueBulkClaimInviteJobs,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockDbInsert,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  creatorClaimInvites: {},
  creatorProfiles: {},
  creatorContacts: {},
}));

vi.mock(
  '@/app/api/admin/creator-invite/bulk/lib/queries',
  async importOriginal => {
    const original =
      await importOriginal<
        typeof import('@/app/api/admin/creator-invite/bulk/lib/queries')
      >();
    return {
      ...original,
      fetchProfilesById: mockFetchProfilesById,
      fetchProfilesByFitScore: mockFetchProfilesByFitScore,
      fetchEligibleProfilesForPreview: mockFetchEligibleProfilesForPreview,
      getEligibleProfileCount: mockGetEligibleProfileCount,
    };
  }
);

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock heavy transitive dependencies to prevent slow module resolution timeouts
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  withScope: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn(),
  captureError: vi.fn(),
  captureWarning: vi.fn(),
  logFallback: vi.fn(),
}));

vi.mock('@/lib/analytics/runtime-aware', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/lib/sentry/init', () => ({
  getSentryMode: vi.fn().mockReturnValue('disabled'),
  isSentryInitialized: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorClaimInvites: { id: 'id', creatorProfileId: 'creatorProfileId' },
  creatorProfiles: {},
}));

// Shared test fixtures
const mockEntitlementsAdmin = {
  userId: 'admin_123',
  email: 'admin@example.com',
  isAuthenticated: true,
  isAdmin: true,
  isPro: true,
  hasAdvancedFeatures: true,
  canRemoveBranding: true,
};

const mockEntitlementsNonAdmin = {
  userId: 'user_123',
  email: 'user@example.com',
  isAuthenticated: true,
  isAdmin: false,
  isPro: false,
  hasAdvancedFeatures: false,
  canRemoveBranding: false,
};

const mockEntitlementsUnauthenticated = {
  userId: null,
  email: null,
  isAuthenticated: false,
  isAdmin: false,
  isPro: false,
  hasAdvancedFeatures: false,
  canRemoveBranding: false,
};

// Valid UUIDs for test fixtures (must be properly formatted UUIDs)
const PROFILE_ID_1 = 'a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6';
const PROFILE_ID_2 = 'b2c3d4e5-f6a7-48b9-c0d1-e2f3a4b5c6d7';
const PROFILE_ID_3 = 'c3d4e5f6-a7b8-49c0-d1e2-f3a4b5c6d7e8';

const mockEligibleProfiles = [
  {
    id: PROFILE_ID_1,
    username: 'artist1',
    displayName: 'Artist One',
    fitScore: 85,
    contactEmail: 'artist1@example.com',
  },
  {
    id: PROFILE_ID_2,
    username: 'artist2',
    displayName: 'Artist Two',
    fitScore: 75,
    contactEmail: 'artist2@example.com',
  },
  {
    id: PROFILE_ID_3,
    username: 'artist3',
    displayName: 'Artist Three',
    fitScore: 65,
    contactEmail: null, // No email
  },
];

describe('POST /api/admin/creator-invite/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue(
      mockEntitlementsUnauthenticated
    );

    const { POST } = await import('@/app/api/admin/creator-invite/bulk/route');
    const request = new Request(
      'http://localhost/api/admin/creator-invite/bulk',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fitScoreThreshold: 50, limit: 10 }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 403 when user is not admin', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue(mockEntitlementsNonAdmin);

    const { POST } = await import('@/app/api/admin/creator-invite/bulk/route');
    const request = new Request(
      'http://localhost/api/admin/creator-invite/bulk',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fitScoreThreshold: 50, limit: 10 }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Forbidden');
  });

  it('returns 400 for invalid request body', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue(mockEntitlementsAdmin);

    const { POST } = await import('@/app/api/admin/creator-invite/bulk/route');
    const request = new Request(
      'http://localhost/api/admin/creator-invite/bulk',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fitScoreThreshold: 150 }), // Invalid: > 100
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid request body');
  });

  it('returns dry run preview without sending', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue(mockEntitlementsAdmin);
    mockFetchProfilesByFitScore.mockResolvedValue(mockEligibleProfiles);

    const { POST } = await import('@/app/api/admin/creator-invite/bulk/route');
    const request = new Request(
      'http://localhost/api/admin/creator-invite/bulk',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fitScoreThreshold: 50,
          limit: 10,
          dryRun: true,
        }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.dryRun).toBe(true);
    expect(data.wouldSend).toBe(2); // 2 profiles with emails
    expect(data.skippedNoEmail).toBe(1); // 1 profile without email
    expect(mockEnqueueBulkClaimInviteJobs).not.toHaveBeenCalled();
  });

  it('returns 200 with no profiles when none eligible', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue(mockEntitlementsAdmin);
    mockFetchProfilesByFitScore.mockResolvedValue([]);
    mockWithSystemIngestionSession.mockImplementation((fn: Function) =>
      fn({ insert: mockDbInsert })
    );

    const { POST } = await import('@/app/api/admin/creator-invite/bulk/route');
    const request = new Request(
      'http://localhost/api/admin/creator-invite/bulk',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fitScoreThreshold: 99, limit: 10 }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.sent).toBe(0);
    expect(data.message).toBe('No eligible profiles with contact emails found');
  });

  it('sends invites and enqueues jobs successfully', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue(mockEntitlementsAdmin);
    mockFetchProfilesByFitScore.mockResolvedValue(mockEligibleProfiles);

    const mockTx = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              { id: 'invite_1', creatorProfileId: PROFILE_ID_1 },
              { id: 'invite_2', creatorProfileId: PROFILE_ID_2 },
            ]),
          }),
        }),
      }),
    };

    mockWithSystemIngestionSession.mockImplementation((fn: Function) =>
      fn(mockTx)
    );
    mockEnqueueBulkClaimInviteJobs.mockResolvedValue({
      enqueued: 2,
      skipped: 0,
    });

    const { POST } = await import('@/app/api/admin/creator-invite/bulk/route');
    const request = new Request(
      'http://localhost/api/admin/creator-invite/bulk',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fitScoreThreshold: 50,
          limit: 10,
          minDelayMs: 30000,
          maxDelayMs: 120000,
        }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.jobsEnqueued).toBe(2);
    expect(data.skippedNoEmail).toBe(1);
    expect(mockEnqueueBulkClaimInviteJobs).toHaveBeenCalledWith(
      mockTx,
      expect.arrayContaining([
        expect.objectContaining({ inviteId: 'invite_1' }),
        expect.objectContaining({ inviteId: 'invite_2' }),
      ]),
      expect.objectContaining({
        minDelayMs: 30000,
        maxDelayMs: 120000,
      })
    );
  });

  it('fetches by profile IDs when provided', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue(mockEntitlementsAdmin);
    mockFetchProfilesById.mockResolvedValue(mockEligibleProfiles.slice(0, 1));

    const mockTx = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue([
                { id: 'invite_1', creatorProfileId: PROFILE_ID_1 },
              ]),
          }),
        }),
      }),
    };

    mockWithSystemIngestionSession.mockImplementation((fn: Function) =>
      fn(mockTx)
    );
    mockEnqueueBulkClaimInviteJobs.mockResolvedValue({
      enqueued: 1,
      skipped: 0,
    });

    const { POST } = await import('@/app/api/admin/creator-invite/bulk/route');
    const request = new Request(
      'http://localhost/api/admin/creator-invite/bulk',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorProfileIds: [PROFILE_ID_1],
          limit: 10,
        }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(mockFetchProfilesById).toHaveBeenCalledWith(
      [PROFILE_ID_1],
      expect.any(Number)
    );
    expect(mockFetchProfilesByFitScore).not.toHaveBeenCalled();
    expect(data.jobsEnqueued).toBe(1);
  });

  it('validates minDelayMs must be <= maxDelayMs', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue(mockEntitlementsAdmin);

    const { POST } = await import('@/app/api/admin/creator-invite/bulk/route');
    const request = new Request(
      'http://localhost/api/admin/creator-invite/bulk',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fitScoreThreshold: 50,
          limit: 10,
          minDelayMs: 120000,
          maxDelayMs: 30000, // Invalid: max < min
        }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid request body');
  });
});

describe('GET /api/admin/creator-invite/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue(
      mockEntitlementsUnauthenticated
    );

    const { GET } = await import('@/app/api/admin/creator-invite/bulk/route');
    const request = new Request(
      'http://localhost/api/admin/creator-invite/bulk?threshold=50&limit=10'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 403 when user is not admin', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue(mockEntitlementsNonAdmin);

    const { GET } = await import('@/app/api/admin/creator-invite/bulk/route');
    const request = new Request(
      'http://localhost/api/admin/creator-invite/bulk?threshold=50&limit=10'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Forbidden');
  });

  it('returns preview with eligible profiles', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue(mockEntitlementsAdmin);
    mockFetchProfilesByFitScore.mockResolvedValue(mockEligibleProfiles);
    mockGetEligibleProfileCount.mockResolvedValue(100);

    const { GET } = await import('@/app/api/admin/creator-invite/bulk/route');
    const request = new Request(
      'http://localhost/api/admin/creator-invite/bulk?threshold=50&limit=10'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.threshold).toBe(50);
    expect(data.totalEligible).toBe(100);
    expect(data.sample.withEmails).toBe(2);
    expect(data.sample.withoutEmails).toBe(1);
    // Emails should be masked
    expect(data.sample.profiles[0].email).toMatch(/^ar\*\*\*@/);
  });

  it('uses default params when not provided', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue(mockEntitlementsAdmin);
    mockFetchProfilesByFitScore.mockResolvedValue([]);
    mockGetEligibleProfileCount.mockResolvedValue(0);

    const { GET } = await import('@/app/api/admin/creator-invite/bulk/route');
    const request = new Request(
      'http://localhost/api/admin/creator-invite/bulk'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.threshold).toBe(50); // Default threshold
    expect(mockFetchProfilesByFitScore).toHaveBeenCalledWith(50, 50);
  });
});

describe('Bulk invite utility functions', () => {
  it('maskEmail masks email correctly', async () => {
    const { maskEmail } = await import(
      '@/app/api/admin/creator-invite/bulk/lib/utils'
    );

    expect(maskEmail('john.doe@example.com')).toBe('jo***@example.com');
    expect(maskEmail('ab@example.com')).toBe('a***@example.com');
    expect(maskEmail('x@test.com')).toBe('x***@test.com');
    expect(maskEmail(null)).toBeUndefined();
    expect(maskEmail(undefined)).toBeUndefined();
    expect(maskEmail('invalid-email')).toBeUndefined();
    expect(maskEmail('has@two@ats.com')).toBeUndefined();
  });

  it('calculateEffectiveLimit caps at 2x maxPerHour', async () => {
    const { calculateEffectiveLimit } = await import(
      '@/app/api/admin/creator-invite/bulk/lib/utils'
    );

    expect(calculateEffectiveLimit(100, 30)).toBe(60); // Capped to 2x30
    expect(calculateEffectiveLimit(50, 30)).toBe(50); // Not capped
    expect(calculateEffectiveLimit(200, 100)).toBe(200); // Capped to 2x100
  });

  it('calculateEstimatedTiming returns correct values', async () => {
    const { calculateEstimatedTiming } = await import(
      '@/app/api/admin/creator-invite/bulk/lib/utils'
    );

    const result = calculateEstimatedTiming(10, 30000, 90000);

    expect(result.avgDelayMs).toBe(60000); // 60 sec avg
    expect(result.estimatedMinutes).toBe(10); // 10 emails * 60 sec = 10 min
  });

  it('parsePreviewParams validates and returns defaults', async () => {
    const { parsePreviewParams } = await import(
      '@/app/api/admin/creator-invite/bulk/lib/utils'
    );

    // Valid params
    const validParams = new URLSearchParams('threshold=75&limit=25');
    expect(parsePreviewParams(validParams)).toEqual({
      fitScoreThreshold: 75,
      limit: 25,
    });

    // Invalid threshold (> 100)
    const invalidThreshold = new URLSearchParams('threshold=150&limit=25');
    expect(parsePreviewParams(invalidThreshold).fitScoreThreshold).toBe(50);

    // Missing params use defaults
    const emptyParams = new URLSearchParams();
    expect(parsePreviewParams(emptyParams)).toEqual({
      fitScoreThreshold: 50,
      limit: 50,
    });

    // Limit capped at 100
    const highLimit = new URLSearchParams('threshold=50&limit=500');
    expect(parsePreviewParams(highLimit).limit).toBe(100);
  });
});
