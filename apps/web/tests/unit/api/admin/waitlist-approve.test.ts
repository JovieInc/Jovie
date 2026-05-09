import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockWithSystemIngestionSession = vi.hoisted(() => vi.fn());
const mockSendNotification = vi.hoisted(() => vi.fn());
const mockBuildWaitlistInviteEmail = vi.hoisted(() => vi.fn());
const mockInvalidateProxyUserStateCache = vi.hoisted(() => vi.fn());
const mockEnqueueWaitlistEmailJob = vi.hoisted(() => vi.fn());

const {
  mockWaitlistEntries,
  mockWaitlistInvites,
  mockCreatorProfiles,
  mockUsers,
} = vi.hoisted(() => ({
  mockWaitlistEntries: {},
  mockWaitlistInvites: {},
  mockCreatorProfiles: {},
  mockUsers: {},
}));

vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: mockInvalidateProxyUserStateCache,
}));

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

vi.mock('@/lib/waitlist/email-jobs', () => ({
  enqueueWaitlistEmailJob: mockEnqueueWaitlistEmailJob,
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: mockCreatorProfiles,
  waitlistEntries: mockWaitlistEntries,
  waitlistInvites: mockWaitlistInvites,
  users: mockUsers,
}));

// Import after mocks are set up
import { POST } from '@/app/app/(shell)/admin/waitlist/approve/route';

describe('Admin Waitlist Approve API', () => {
  const mockMessage = { id: 'test', subject: 'Welcome' };
  const mockTarget = { email: 'user@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildWaitlistInviteEmail.mockReturnValue({
      message: mockMessage,
      target: mockTarget,
      inviteUrl: 'https://example.com/signin',
    });
    mockSendNotification.mockResolvedValue({ delivered: ['email'] });
    mockEnqueueWaitlistEmailJob.mockResolvedValue('job-1');
  });

  it('rejects concurrent approvals after the entry is processed', async () => {
    const entryId = '11111111-1111-4111-8111-111111111111';

    mockWithSystemIngestionSession
      .mockResolvedValueOnce({
        outcome: 'approved',
        entryId,
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
    expect(secondResponse.status).toBe(200);
    expect(secondData.message).toBe(
      'Entry already processed with status: invited'
    );
    expect(mockWithSystemIngestionSession).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'serializable' }
    );
  });

  it('returns success when approval queues invite delivery', async () => {
    const entryId = '22222222-2222-4222-8222-222222222222';
    const profileId = 'profile_456';
    const email = 'newuser@example.com';
    const fullName = 'New User';

    mockWithSystemIngestionSession.mockResolvedValueOnce({
      outcome: 'approved',
      entryId,
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

    expect(data.status).toBe('invited');
    expect(data.message).toBe('Access approved. Invite email queued.');
    expect(mockBuildWaitlistInviteEmail).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('approves access when no profile exists yet', async () => {
    const entryId = '44444444-4444-4444-8444-444444444444';

    mockWithSystemIngestionSession.mockResolvedValueOnce({
      outcome: 'approved',
      entryId,
      profileId: null,
      email: 'newuser@example.com',
      fullName: 'New User',
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

    const response = await POST(
      new Request('http://localhost/app/admin/waitlist/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId }),
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.profileId).toBe(null);
    expect(data.waitlistEntryId).toBe(entryId);
    expect(data.status).toBe('invited');
  });

  it('returns 422 when user has not signed in yet', async () => {
    const entryId = '55555555-5555-4555-8555-555555555555';

    mockWithSystemIngestionSession.mockResolvedValueOnce({
      outcome: 'no_user',
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

    const response = await POST(
      new Request('http://localhost/app/admin/waitlist/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId }),
      })
    );
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/sign in/i);
    expect(mockBuildWaitlistInviteEmail).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
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

    const url = 'http://localhost/app/admin/waitlist/approve';
    const request = new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockBuildWaitlistInviteEmail).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});
