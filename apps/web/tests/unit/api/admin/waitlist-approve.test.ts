import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockWithSystemIngestionSession = vi.hoisted(() => vi.fn());

const mockWaitlistEntries = {};
const mockWaitlistInvites = {};
const mockCreatorProfiles = {};

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: mockCreatorProfiles,
  waitlistEntries: mockWaitlistEntries,
  waitlistInvites: mockWaitlistInvites,
}));

describe('Admin Waitlist Approve API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('rejects concurrent approvals after the entry is processed', async () => {
    const entryId = '11111111-1111-4111-8111-111111111111';

    mockWithSystemIngestionSession
      .mockResolvedValueOnce({
        outcome: 'approved',
        inviteId: 'invite_123',
        claimToken: 'token_123',
      })
      .mockResolvedValueOnce({
        outcome: 'already_processed',
        status: 'invited',
      });

    mockGetCurrentUserEntitlements.mockResolvedValue({
      userId: 'admin_123',
      email: 'admin@example.com',
      isAuthenticated: true,
      isAdmin: true,
      isPro: true,
      hasAdvancedFeatures: true,
      canRemoveBranding: true,
    });

    const { POST } = await import('@/app/app/admin/waitlist/approve/route');
    const url = 'http://localhost/app/admin/waitlist/approve';
    const requestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId }),
    };

    const [firstResponse, secondResponse] = await Promise.all([
      POST(new Request(url, requestInit)),
      POST(new Request(url, requestInit)),
    ]);

    const firstData = await firstResponse.json();
    const secondData = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstData.success).toBe(true);
    expect(secondResponse.status).toBe(409);
    expect(secondData.error).toBe(
      'Entry already processed with status: invited'
    );
    expect(mockWithSystemIngestionSession).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'serializable' }
    );
  });
});
