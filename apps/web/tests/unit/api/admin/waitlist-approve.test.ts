import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockWithSystemIngestionSession = vi.hoisted(() => vi.fn());
const mockSendNotification = vi.hoisted(() => vi.fn());
const mockBuildWaitlistInviteEmail = vi.hoisted(() => vi.fn());

const mockWaitlistEntries = {};
const mockWaitlistInvites = {};
const mockCreatorProfiles = {};
const mockUsers = {};

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

vi.mock('@/lib/notifications/service', () => ({
  sendNotification: mockSendNotification,
}));

vi.mock('@/lib/waitlist/invite', () => ({
  buildWaitlistInviteEmail: mockBuildWaitlistInviteEmail,
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: mockCreatorProfiles,
  waitlistEntries: mockWaitlistEntries,
  waitlistInvites: mockWaitlistInvites,
  users: mockUsers,
}));

describe('Admin Waitlist Approve API', () => {
  const mockMessage = { id: 'test', subject: 'Welcome' };
  const mockTarget = { email: 'user@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockBuildWaitlistInviteEmail.mockReturnValue({
      message: mockMessage,
      target: mockTarget,
      inviteUrl: 'https://example.com/signin',
    });
    mockSendNotification.mockResolvedValue({ delivered: ['email'] });
  });

  it('rejects concurrent approvals after the entry is processed', async () => {
    const entryId = '11111111-1111-4111-8111-111111111111';

    mockWithSystemIngestionSession
      .mockResolvedValueOnce({
        outcome: 'approved',
        profileId: 'profile_123',
        email: 'user@example.com',
        fullName: 'Test User',
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

  it('sends welcome email on successful approval', async () => {
    const entryId = '22222222-2222-4222-8222-222222222222';
    const profileId = 'profile_456';
    const email = 'newuser@example.com';
    const fullName = 'New User';

    mockWithSystemIngestionSession.mockResolvedValueOnce({
      outcome: 'approved',
      profileId,
      email,
      fullName,
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
    const request = new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify email building was called with correct params
    expect(mockBuildWaitlistInviteEmail).toHaveBeenCalledWith({
      email,
      fullName,
      dedupKey: `waitlist_welcome:${profileId}`,
    });

    // Verify notification was sent
    expect(mockSendNotification).toHaveBeenCalledWith(mockMessage, mockTarget);
  });

  it('does not send email when entry is already processed', async () => {
    const entryId = '33333333-3333-4333-8333-333333333333';

    mockWithSystemIngestionSession.mockResolvedValueOnce({
      outcome: 'already_processed',
      status: 'claimed',
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
    const request = new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(409);
    expect(mockBuildWaitlistInviteEmail).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});
