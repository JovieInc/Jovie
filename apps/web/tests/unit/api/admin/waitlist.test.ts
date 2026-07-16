import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockGetAdminWaitlistEntries = vi.hoisted(() => vi.fn());

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/admin/waitlist', () => ({
  getAdminWaitlistEntries: mockGetAdminWaitlistEntries,
}));

describe('GET /api/admin/waitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue({
      userId: null,
      email: null,
      isAuthenticated: false,
      isAdmin: false,
      isPro: false,
      hasAdvancedFeatures: false,
      canRemoveBranding: false,
    });

    const { GET } = await import('@/app/api/admin/waitlist/route');
    const request = new Request('http://localhost/api/admin/waitlist');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(mockGetAdminWaitlistEntries).not.toHaveBeenCalled();
  });

  it('returns 403 when authenticated user is not admin', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue({
      userId: 'user_123',
      email: 'user@example.com',
      isAuthenticated: true,
      isAdmin: false,
      isPro: false,
      hasAdvancedFeatures: false,
      canRemoveBranding: false,
    });

    const { GET } = await import('@/app/api/admin/waitlist/route');
    const request = new Request('http://localhost/api/admin/waitlist');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Forbidden');
    expect(mockGetAdminWaitlistEntries).not.toHaveBeenCalled();
  });

  it('returns 200 with entries for admins', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue({
      userId: 'admin_123',
      email: 'admin@example.com',
      isAuthenticated: true,
      isAdmin: true,
      isPro: true,
      hasAdvancedFeatures: true,
      canRemoveBranding: true,
    });

    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    mockGetAdminWaitlistEntries.mockResolvedValue({
      entries: [
        {
          id: 'entry_1',
          fullName: 'Test User',
          email: 'test@example.com',
          primaryGoal: 'streams',
          primarySocialUrl: 'https://instagram.com/test',
          primarySocialPlatform: 'instagram',
          primarySocialUrlNormalized: 'instagram.com/test',
          spotifyUrl: null,
          spotifyUrlNormalized: null,
          spotifyArtistName: null,
          heardAbout: null,
          status: 'new',
          primarySocialFollowerCount: null,
          createdAt,
          updatedAt,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    const { GET } = await import('@/app/api/admin/waitlist/route');
    const request = new Request(
      'http://localhost/api/admin/waitlist?page=2&pageSize=10'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetAdminWaitlistEntries).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
    });
    expect(data.total).toBe(1);
    expect(data.rows).toEqual([
      expect.objectContaining({
        id: 'entry_1',
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      }),
    ]);
  });
});
