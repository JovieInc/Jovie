import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: vi
    .fn()
    .mockImplementation(
      async (operation: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: 'profile_123',
                  username: 'test',
                  usernameNormalized: 'test',
                  displayName: 'Test',
                  avatarUrl: null,
                  claimToken: 'claim_token',
                  isClaimed: false,
                  claimTokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
                  avatarLockedByUser: false,
                  displayNameLocked: false,
                },
              ]),
            }),
          }),
        };

        return operation(tx);
      }
    ),
}));

vi.mock('@/lib/ingestion/strategies/linktree', () => ({
  isValidHandle: vi.fn().mockReturnValue(true),
  validateLinktreeUrl: vi
    .fn()
    .mockImplementation(
      (url: string) => `https://linktr.ee/${url.split('/').pop()}`
    ),
  extractLinktreeHandle: vi.fn().mockReturnValue('test'),
  normalizeHandle: vi.fn().mockReturnValue('test'),
  fetchLinktreeDocument: vi.fn().mockResolvedValue('<html></html>'),
  extractLinktree: vi.fn().mockReturnValue({
    displayName: 'Test',
    avatarUrl: null,
    links: [],
  }),
}));

vi.mock('@/lib/ingestion/magic-profile-avatar', () => ({
  maybeCopyIngestionAvatarFromLinks: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/ingestion/processor', () => ({
  enqueueFollowupIngestionJobs: vi.fn().mockResolvedValue(undefined),
  normalizeAndMergeExtraction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/ingestion/status-manager', () => ({
  IngestionStatusManager: {
    markProcessing: vi.fn().mockResolvedValue(undefined),
    markIdleOrFailed: vi.fn().mockResolvedValue(undefined),
  },
}));

// Import after mocks are set up
import { POST } from '@/app/api/admin/creator-ingest/route';

describe('Admin Creator Ingest API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/admin/creator-ingest', () => {
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
      const request = new NextRequest(
        'http://localhost/api/admin/creator-ingest',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://linktr.ee/test' }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 403 when user is not admin', async () => {
      mockGetCurrentUserEntitlements.mockResolvedValue({
        userId: 'user_123',
        email: 'user@example.com',
        isAuthenticated: true,
        isAdmin: false,
        isPro: false,
        hasAdvancedFeatures: false,
        canRemoveBranding: false,
      });

      const request = new NextRequest(
        'http://localhost/api/admin/creator-ingest',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://linktr.ee/test' }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('triggers ingestion for admins', async () => {
      mockGetCurrentUserEntitlements.mockResolvedValue({
        userId: 'admin_123',
        email: 'admin@example.com',
        isAuthenticated: true,
        isAdmin: true,
        isPro: true,
        hasAdvancedFeatures: true,
        canRemoveBranding: true,
      });

      const request = new NextRequest(
        'http://localhost/api/admin/creator-ingest',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://linktr.ee/test' }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.profile).toBeDefined();
    });
  });
});
