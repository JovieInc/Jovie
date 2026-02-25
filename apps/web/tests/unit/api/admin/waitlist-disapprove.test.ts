import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockWithSystemIngestionSession = vi.hoisted(() => vi.fn());
const mockFinalizeWaitlistDisapproval = vi.hoisted(() => vi.fn());

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

vi.mock('@/lib/waitlist/approval', () => ({
  disapproveWaitlistEntryInTx: vi.fn(),
  finalizeWaitlistDisapproval: mockFinalizeWaitlistDisapproval,
}));

import { POST } from '@/app/app/(shell)/admin/waitlist/disapprove/route';

describe('Admin Waitlist Disapprove API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserEntitlements.mockResolvedValue({
      userId: 'admin_123',
      email: 'admin@example.com',
      isAuthenticated: true,
      isAdmin: true,
      isPro: true,
      hasAdvancedFeatures: true,
      canRemoveBranding: true,
    });
  });

  it('returns success and new status when disapproval succeeds', async () => {
    mockWithSystemIngestionSession.mockResolvedValueOnce({
      outcome: 'disapproved',
      clerkId: 'user_123',
    });

    const response = await POST(
      new Request('http://localhost/app/admin/waitlist/disapprove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: '33333333-3333-4333-8333-333333333333',
        }),
      })
    );

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status).toBe('new');
    expect(mockFinalizeWaitlistDisapproval).toHaveBeenCalled();
  });

  it('returns success when entry is already unapproved', async () => {
    mockWithSystemIngestionSession.mockResolvedValueOnce({
      outcome: 'already_new',
    });

    const response = await POST(
      new Request('http://localhost/app/admin/waitlist/disapprove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: '44444444-4444-4444-8444-444444444444',
        }),
      })
    );

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status).toBe('new');
    expect(mockFinalizeWaitlistDisapproval).not.toHaveBeenCalled();
  });
});
