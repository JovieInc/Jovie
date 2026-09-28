import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/admin/assets/route';

const { mockRequireAdmin, mockGetAdminAssets, mockCaptureError } = vi.hoisted(
  () => ({
    mockRequireAdmin: vi.fn(),
    mockGetAdminAssets: vi.fn(),
    mockCaptureError: vi.fn(),
  })
);

vi.mock('@/lib/admin/middleware', () => ({
  requireAdmin: mockRequireAdmin,
}));
vi.mock('@/lib/admin/assets', () => ({
  adminAssetIssuesFilters: ['all', 'issues'],
  adminAssetSortFields: [
    'created_desc',
    'created_asc',
    'title_asc',
    'title_desc',
  ],
  adminAssetTypes: ['release', 'track', 'link', 'photo'],
  adminAssetVerifiedFilters: ['all', 'verified', 'unverified'],
  getAdminAssets: mockGetAdminAssets,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mockCaptureError }));

const url = (qs: string) =>
  `http://localhost/api/admin/assets${qs ? `?${qs}` : ''}`;

describe('GET /api/admin/assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null);
    mockGetAdminAssets.mockResolvedValue({
      assets: [
        {
          id: 'a1',
          assetType: 'release',
          title: 'First Light',
          createdAt: new Date('2026-08-22T00:00:00.000Z'),
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });

  it('returns mapped rows with filters', async () => {
    const res = await GET(
      new NextRequest(
        url(
          'type=release&issues=issues&verified=verified&sort=title_asc&q=bloom'
        )
      ) as unknown as Request
    );
    expect(res.status).toBe(200);
    expect(mockGetAdminAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'release',
        issues: 'issues',
        verified: 'verified',
        sort: 'title_asc',
        search: 'bloom',
      })
    );
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.rows[0].createdAt).toBe('2026-08-22T00:00:00.000Z');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects invalid sort/type/issues/verified params', async () => {
    for (const qs of [
      'sort=bogus',
      'type=bogus',
      'issues=bogus',
      'verified=bogus',
    ]) {
      const res = await GET(new NextRequest(url(qs)) as unknown as Request);
      expect(res.status).toBe(400);
    }
    expect(mockGetAdminAssets).not.toHaveBeenCalled();
  });

  it('returns the admin auth error when unauthorized', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );
    const res = await GET(new NextRequest(url('')) as unknown as Request);
    expect(res.status).toBe(403);
  });

  it('returns 500 and captures errors when the query fails', async () => {
    mockGetAdminAssets.mockRejectedValue(new Error('db down'));
    const res = await GET(new NextRequest(url('')) as unknown as Request);
    expect(res.status).toBe(500);
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Failed to fetch admin assets',
      expect.any(Error)
    );
  });
});
