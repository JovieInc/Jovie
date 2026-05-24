import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockWithSystemIngestionSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

vi.mock('@/lib/waitlist/audit', () => ({
  insertWaitlistAuditLog: vi.fn(),
}));

import { POST } from '@/app/app/(shell)/admin/waitlist/update-status/route';

function request(body: unknown) {
  return new Request('http://localhost/app/admin/waitlist/update-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Admin Waitlist Update Status API', () => {
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

  it('rejects side-effect terminal statuses that would bypass revocation flows', async () => {
    const response = await POST(
      request({
        entryId: '11111111-1111-4111-8111-111111111111',
        status: 'blocked',
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(mockWithSystemIngestionSession).not.toHaveBeenCalled();
  });

  it('returns conflict when the state machine rejects a transition', async () => {
    mockWithSystemIngestionSession.mockResolvedValueOnce({
      outcome: 'invalid_transition',
      fromStatus: 'invited',
      toStatus: 'waitlisted',
    });

    const response = await POST(
      request({
        entryId: '22222222-2222-4222-8222-222222222222',
        status: 'waitlisted',
      })
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.success).toBe(false);
    expect(data.error).toContain('invited -> waitlisted');
  });
});
