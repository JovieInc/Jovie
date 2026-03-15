import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn(() => 'eq-clause'));
const mockAnd = vi.hoisted(() => vi.fn(() => 'and-clause'));
const mockOr = vi.hoisted(() => vi.fn(() => 'or-clause'));
const mockIlike = vi.hoisted(() => vi.fn(() => 'ilike-clause'));
const mockAsc = vi.hoisted(() => vi.fn(() => 'asc-clause'));
const mockDesc = vi.hoisted(() => vi.fn(() => 'desc-clause'));
const mockCount = vi.hoisted(() => vi.fn(() => 'count-clause'));
const mockCaptureWarning = vi.hoisted(() => vi.fn());

const { mockDb, mockSelect, mockListOffset, mockCountWhere } = vi.hoisted(
  () => {
    const mockListOffset = vi.fn();
    const mockListLimit = vi.fn(() => ({ offset: mockListOffset }));
    const mockListOrderBy = vi.fn(() => ({ limit: mockListLimit }));
    const mockListWhere = vi.fn(() => ({ orderBy: mockListOrderBy }));
    const mockListFrom = vi.fn(() => ({ where: mockListWhere }));

    const mockCountWhere = vi.fn();
    const mockCountFrom = vi.fn(() => ({ where: mockCountWhere }));

    const mockSelect = vi
      .fn()
      .mockImplementationOnce(() => ({ from: mockListFrom }))
      .mockImplementationOnce(() => ({ from: mockCountFrom }));

    return {
      mockDb: { select: mockSelect },
      mockSelect,
      mockListOffset,
      mockCountWhere,
    };
  }
);

vi.mock('drizzle-orm', () => ({
  and: mockAnd,
  asc: mockAsc,
  count: mockCount,
  desc: mockDesc,
  eq: mockEq,
  ilike: mockIlike,
  or: mockOr,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/db/schema/leads', () => ({
  leads: {
    status: 'status',
    fitScore: 'fit-score',
    priorityScore: 'priority-score',
    displayName: 'display-name',
    createdAt: 'created-at',
    linktreeHandle: 'linktree-handle',
    updatedAt: 'updated-at',
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

import { GET } from '@/app/api/admin/leads/route';

describe('GET /api/admin/leads', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });

    mockListOffset.mockResolvedValue([
      {
        id: 'lead-1',
        hasSpotifyLink: null,
        hasInstagram: null,
        musicToolsDetected: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-02T00:00:00.000Z'),
        qualifiedAt: null,
        disqualifiedAt: null,
        approvedAt: null,
        ingestedAt: null,
        rejectedAt: null,
        latestReleaseDate: null,
        scrapedAt: null,
        outreachQueuedAt: null,
        claimTokenExpiresAt: null,
        dmSentAt: null,
      },
    ]);

    mockCountWhere.mockResolvedValue([{ count: 1 }]);

    mockSelect
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({ offset: mockListOffset })),
            })),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({ where: mockCountWhere })),
      }));
  });

  it('returns leads with safe defaults for nullable fields', async () => {
    const request = {
      nextUrl: new URL('http://localhost/api/admin/leads?page=1&limit=25'),
    } as never;

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toEqual(
      expect.objectContaining({
        hasSpotifyLink: false,
        hasInstagram: false,
        musicToolsDetected: [],
        createdAt: '2025-01-01T00:00:00.000Z',
      })
    );
  });

  it('falls back to the legacy select when lead enrichment columns are missing', async () => {
    mockSelect.mockReset();
    mockSelect
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi
                  .fn()
                  .mockRejectedValue(
                    new Error('column "music_tools_detected" does not exist')
                  ),
              })),
            })),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn().mockResolvedValue([
                  {
                    id: 'lead-1',
                    hasSpotifyLink: null,
                    hasInstagram: null,
                    musicToolsDetected: null,
                    createdAt: new Date('2025-01-01T00:00:00.000Z'),
                    updatedAt: new Date('2025-01-02T00:00:00.000Z'),
                    qualifiedAt: null,
                    disqualifiedAt: null,
                    approvedAt: null,
                    ingestedAt: null,
                    rejectedAt: null,
                    latestReleaseDate: null,
                    scrapedAt: null,
                    outreachQueuedAt: null,
                    claimTokenExpiresAt: null,
                    dmSentAt: null,
                  },
                ]),
              })),
            })),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        })),
      }));

    const request = {
      nextUrl: new URL('http://localhost/api/admin/leads?page=1&limit=25'),
    } as never;

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items[0]).toEqual(
      expect.objectContaining({
        musicToolsDetected: [],
        spotifyPopularity: null,
        spotifyFollowers: null,
        releaseCount: null,
        priorityScore: null,
      })
    );
    expect(mockCaptureWarning).toHaveBeenCalled();
  });
});
