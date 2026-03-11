import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());
const mockParseJsonBody = vi.hoisted(() => vi.fn());
const mockProcessLeadBatch = vi.hoisted(() => vi.fn());
const mockSeedLeadFromUrl = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn(() => 'eq-clause'));
const mockSql = vi.hoisted(() =>
  vi.fn((strings: unknown, ...values: unknown[]) => ({
    strings,
    values,
  }))
);

const { mockDb, mockSelect, mockInsert, mockExecute } = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockExecute = vi.fn();

  return {
    mockDb: {
      select: mockSelect,
      insert: mockInsert,
      execute: mockExecute,
    },
    mockSelect,
    mockInsert,
    mockExecute,
  };
});

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and-clause'),
  asc: vi.fn(() => 'asc-clause'),
  count: vi.fn(() => 'count-clause'),
  desc: vi.fn(() => 'desc-clause'),
  eq: mockEq,
  ilike: vi.fn(() => 'ilike-clause'),
  or: vi.fn(() => 'or-clause'),
  sql: mockSql,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/db/sql-helpers', () => ({
  sqlArray: vi.fn((value: unknown) => value),
}));

vi.mock('@/lib/db/schema/leads', () => ({
  leads: {
    id: 'id',
    linktreeHandle: 'linktree-handle',
  },
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  captureWarning: mockCaptureWarning,
  getSafeErrorMessage: () => 'safe-error',
}));

vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: mockParseJsonBody,
}));

vi.mock('@/lib/leads/process-batch', () => ({
  processLeadBatch: mockProcessLeadBatch,
}));

vi.mock('@/lib/leads/url-intake', () => ({
  seedLeadFromUrl: mockSeedLeadFromUrl,
}));

import { POST } from '@/app/api/admin/leads/route';

describe('POST /api/admin/leads', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });
    mockParseJsonBody.mockResolvedValue({
      ok: true,
      data: { urls: ['https://linktr.ee/test-artist'] },
    });
    mockSeedLeadFromUrl.mockReturnValue({
      handle: 'test-artist',
      normalizedUrl: 'https://linktr.ee/test-artist',
      hasSpotifyLink: true,
      spotifyUrl: 'https://open.spotify.com/artist/123',
      hasInstagram: false,
      instagramHandle: null,
      kind: 'spotify',
    });
    mockProcessLeadBatch.mockResolvedValue({
      total: 1,
      qualified: 1,
      disqualified: 0,
      error: 0,
    });

    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });
  });

  it('falls back to a legacy insert when leads rollout columns are missing', async () => {
    mockInsert.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi
          .fn()
          .mockRejectedValue(
            new Error(
              'column "spotify_popularity" of relation "leads" does not exist'
            )
          ),
      })),
    });
    mockExecute.mockResolvedValue({
      rows: [{ id: 'lead-1' }],
    });

    const request = new NextRequest('http://localhost/api/admin/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: ['https://linktr.ee/test-artist'] }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.summary.created).toBe(1);
    expect(mockExecute).toHaveBeenCalledOnce();
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      '[admin/leads] leads insert columns missing; falling back to legacy insert',
      expect.any(Error),
      { route: '/api/admin/leads', handle: 'test-artist' }
    );
  });
});
