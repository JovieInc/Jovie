import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  getCurrentUserEntitlementsMock: vi.fn(),
  verifyOwnershipMock: vi.fn(),
  runReleaseAutopilotMock: vi.fn(),
  captureErrorMock: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlementsMock,
}));

vi.mock('@/lib/db/queries/shared', () => ({
  verifyProfileOwnership: hoisted.verifyOwnershipMock,
}));

vi.mock('@/lib/services/release-autopilot', () => ({
  runReleaseAutopilot: hoisted.runReleaseAutopilotMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

describe('POST /api/release-autopilot/run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'clerk_123' });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      isAdmin: false,
      canAccessMerchCreation: true,
    });
    hoisted.verifyOwnershipMock.mockResolvedValue({ id: 'profile_123' });
    hoisted.runReleaseAutopilotMock.mockResolvedValue({
      releaseId: '22222222-2222-4222-8222-222222222222',
      releaseTitle: 'Midnight Static',
      merchDrop: {
        status: 'created',
        merchCardId: 'merch_123',
        generationId: 'generation_123',
        approvalStatus: 'needs_review',
      },
    });
  });

  it('returns a draft merch drop for owned releases', async () => {
    const { POST } = await import('@/app/api/release-autopilot/run/route');

    const response = await POST(
      new Request('http://localhost/api/release-autopilot/run', {
        method: 'POST',
        body: JSON.stringify({
          profileId: '11111111-1111-4111-8111-111111111111',
          releaseId: '22222222-2222-4222-8222-222222222222',
        }),
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.merchDrop.approvalStatus).toBe('needs_review');
    expect(hoisted.runReleaseAutopilotMock).toHaveBeenCalledWith({
      profileId: '11111111-1111-4111-8111-111111111111',
      releaseId: '22222222-2222-4222-8222-222222222222',
      clerkUserId: 'clerk_123',
    });
  });

  it('returns 404 when the authenticated user does not own the profile', async () => {
    hoisted.verifyOwnershipMock.mockResolvedValue(null);
    const { POST } = await import('@/app/api/release-autopilot/run/route');

    const response = await POST(
      new Request('http://localhost/api/release-autopilot/run', {
        method: 'POST',
        body: JSON.stringify({
          profileId: '11111111-1111-4111-8111-111111111111',
          releaseId: '22222222-2222-4222-8222-222222222222',
        }),
      })
    );

    expect(response.status).toBe(404);
  });

  it('returns 403 when the user plan cannot access merch creation', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      isAdmin: false,
      canAccessMerchCreation: false,
    });

    const { POST } = await import('@/app/api/release-autopilot/run/route');

    const response = await POST(
      new Request('http://localhost/api/release-autopilot/run', {
        method: 'POST',
        body: JSON.stringify({
          profileId: '11111111-1111-4111-8111-111111111111',
          releaseId: '22222222-2222-4222-8222-222222222222',
        }),
      })
    );

    expect(response.status).toBe(403);
  });
});
