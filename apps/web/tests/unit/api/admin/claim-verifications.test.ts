import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  entitlements: vi.fn(),
  list: vi.fn(),
  decide: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  getOvieOperatorEntitlements: mocks.entitlements,
}));
vi.mock('@/lib/claim/claim-verification-review.server', () => ({
  listClaimVerifications: mocks.list,
  decideClaimVerification: mocks.decide,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));

const { GET } = await import('@/app/api/admin/claim-verifications/route');
const { POST } = await import(
  '@/app/api/admin/claim-verifications/[profileId]/decision/route'
);

const PROFILE = '11111111-2222-4333-8444-555555555555';
const admin = {
  isAuthenticated: true,
  isAdmin: true,
  email: 'tim@jov.ie',
  userId: 'u-admin',
};

function decide(body: unknown, profileId = PROFILE) {
  return POST(
    new Request(
      `https://jov.ie/api/admin/claim-verifications/${profileId}/decision`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }
    ),
    { params: Promise.resolve({ profileId }) }
  );
}

describe('admin claim verification routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.entitlements.mockResolvedValue(admin);
  });

  it('lists pending verifications for admins only', async () => {
    mocks.list.mockResolvedValue([{ profileId: PROFILE }]);
    const ok = await GET(
      new NextRequest('https://jov.ie/api/admin/claim-verifications')
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      status: 'pending_verification',
      items: [{ profileId: PROFILE }],
    });
    expect(mocks.list).toHaveBeenCalledWith('pending_verification');

    mocks.entitlements.mockResolvedValue({ ...admin, isAdmin: false });
    const forbidden = await GET(
      new NextRequest('https://jov.ie/api/admin/claim-verifications')
    );
    expect(forbidden.status).toBe(403);
  });

  it('rejects an unknown status filter', async () => {
    const response = await GET(
      new NextRequest(
        'https://jov.ie/api/admin/claim-verifications?status=approved'
      )
    );
    expect(response.status).toBe(400);
  });

  it('requires a signed-in admin to decide', async () => {
    mocks.entitlements.mockResolvedValue({
      ...admin,
      isAuthenticated: false,
      isAdmin: false,
    });
    expect((await decide({ decision: 'reject' })).status).toBe(401);
    mocks.entitlements.mockResolvedValue({ ...admin, isAdmin: false });
    expect((await decide({ decision: 'reject' })).status).toBe(403);
    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it('passes an explicit decision through with the operator identity', async () => {
    mocks.decide.mockResolvedValue({
      outcome: 'decided',
      record: { status: 'rejected' },
    });
    const response = await decide({ decision: 'reject', reason: 'no proof' });
    expect(response.status).toBe(200);
    expect(mocks.decide).toHaveBeenCalledWith({
      profileId: PROFILE,
      decision: 'reject',
      reason: 'no proof',
      decidedBy: 'tim@jov.ie',
    });
  });

  it('maps not-pending, conflicts and failures', async () => {
    mocks.decide.mockResolvedValueOnce({
      outcome: 'not_pending',
      record: { status: 'verified' },
    });
    expect((await decide({ decision: 'approve' })).status).toBe(409);
    mocks.decide.mockResolvedValueOnce({ outcome: 'identity_conflict' });
    expect((await decide({ decision: 'approve' })).status).toBe(409);
    mocks.decide.mockResolvedValueOnce({ outcome: 'not_found' });
    expect((await decide({ decision: 'approve' })).status).toBe(404);
    mocks.decide.mockRejectedValueOnce(new Error('stripe down'));
    expect((await decide({ decision: 'reject' })).status).toBe(500);
  });

  it('validates the profile id and body before deciding', async () => {
    expect((await decide({ decision: 'approve' }, 'nope')).status).toBe(404);
    expect((await decide({ decision: 'refund' })).status).toBe(422);
    expect(mocks.decide).not.toHaveBeenCalled();
  });
});
