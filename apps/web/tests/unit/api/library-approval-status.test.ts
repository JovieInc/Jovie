import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getSessionContext: vi.fn(),
}));

const serviceMocks = vi.hoisted(() => ({
  getLibraryApprovalStatusForAsset: vi.fn(),
  upsertLibraryApprovalStatus: vi.fn(),
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: authMocks.requireAuth,
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: authMocks.getSessionContext,
}));

vi.mock('@/lib/library/approval-status', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/library/approval-status')>();
  return {
    ...actual,
    getLibraryApprovalStatusForAsset:
      serviceMocks.getLibraryApprovalStatusForAsset,
    upsertLibraryApprovalStatus: serviceMocks.upsertLibraryApprovalStatus,
  };
});

describe('/api/library/approval-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireAuth.mockResolvedValue({
      userId: 'user_123',
      error: null,
    });
    authMocks.getSessionContext.mockResolvedValue({
      profile: { id: '11111111-1111-4111-8111-111111111111' },
    });
  });

  it('returns approval status for owned assets', async () => {
    serviceMocks.getLibraryApprovalStatusForAsset.mockResolvedValue(
      'needs_review'
    );

    const { GET } = await import('@/app/api/library/approval-status/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/library/approval-status?profileId=11111111-1111-4111-8111-111111111111&assetId=release_123'
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      assetId: 'release_123',
      approvalStatus: 'needs_review',
    });
  });

  it('updates approval status for owned assets', async () => {
    serviceMocks.upsertLibraryApprovalStatus.mockResolvedValue('approved');

    const { PATCH } = await import('@/app/api/library/approval-status/route');
    const response = await PATCH(
      new NextRequest('http://localhost/api/library/approval-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: '11111111-1111-4111-8111-111111111111',
          assetId: 'release_123',
          itemKind: 'release',
          approvalStatus: 'approved',
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      assetId: 'release_123',
      approvalStatus: 'approved',
    });
    expect(serviceMocks.upsertLibraryApprovalStatus).toHaveBeenCalledWith({
      creatorProfileId: '11111111-1111-4111-8111-111111111111',
      assetId: 'release_123',
      itemKind: 'release',
      approvalStatus: 'approved',
    });
  });
});
