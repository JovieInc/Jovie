import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockWithSystemIngestionSession = vi.hoisted(() => vi.fn());
const mockInvalidateProxyUserStateCache = vi.hoisted(() => vi.fn());
const mockApproveWaitlistEntryInTx = vi.hoisted(() => vi.fn());
const mockFinalizeWaitlistApproval = vi.hoisted(() => vi.fn());
const mockEnqueueWaitlistApprovalInviteEmail = vi.hoisted(() => vi.fn());

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

vi.mock('@/lib/waitlist/approval', () => ({
  approveWaitlistEntryInTx: mockApproveWaitlistEntryInTx,
  finalizeWaitlistApproval: mockFinalizeWaitlistApproval,
}));

vi.mock('@/lib/waitlist/email-jobs', () => ({
  enqueueWaitlistApprovalInviteEmail: mockEnqueueWaitlistApprovalInviteEmail,
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
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithSystemIngestionSession.mockImplementation(async operation =>
      operation({} as never)
    );
    mockFinalizeWaitlistApproval.mockResolvedValue(undefined);
    mockEnqueueWaitlistApprovalInviteEmail.mockResolvedValue('job-1');
  });

  it('rejects concurrent approvals after the entry is processed', async () => {
    const entryId = '11111111-1111-4111-8111-111111111111';

    mockApproveWaitlistEntryInTx
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

    mockApproveWaitlistEntryInTx.mockResolvedValueOnce({
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
    expect(mockEnqueueWaitlistApprovalInviteEmail).toHaveBeenCalledWith(
      expect.anything(),
      entryId
    );
  });

  it('approves access when no profile exists yet', async () => {
    const entryId = '44444444-4444-4444-8444-444444444444';

    mockApproveWaitlistEntryInTx.mockResolvedValueOnce({
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

    mockApproveWaitlistEntryInTx.mockResolvedValueOnce({
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
    expect(mockEnqueueWaitlistApprovalInviteEmail).not.toHaveBeenCalled();
  });

  it('does not send email when entry is already invited', async () => {
    const entryId = '33333333-3333-4333-8333-333333333333';

    mockApproveWaitlistEntryInTx.mockResolvedValueOnce({
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
    const request = new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockEnqueueWaitlistApprovalInviteEmail).not.toHaveBeenCalled();
  });

  it('returns 409 when an admin approves a rejected entry', async () => {
    const entryId = '66666666-6666-4666-8666-666666666666';

    mockApproveWaitlistEntryInTx.mockResolvedValueOnce({
      outcome: 'already_processed',
      status: 'rejected',
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

    expect(response.status).toBe(409);
    expect(data.success).toBe(false);
    expect(data.status).toBe('rejected');
    expect(data.error).toBe('Entry cannot be approved from status: rejected');
    expect(mockEnqueueWaitlistApprovalInviteEmail).not.toHaveBeenCalled();
  });

  it('returns 409 when an admin approves a signed-up entry', async () => {
    const entryId = '77777777-7777-4777-8777-777777777777';

    mockApproveWaitlistEntryInTx.mockResolvedValueOnce({
      outcome: 'already_processed',
      status: 'signed_up',
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

    expect(response.status).toBe(409);
    expect(data.success).toBe(false);
    expect(data.status).toBe('signed_up');
    expect(data.error).toBe('Entry cannot be approved from status: signed_up');
    expect(mockEnqueueWaitlistApprovalInviteEmail).not.toHaveBeenCalled();
  });
});
