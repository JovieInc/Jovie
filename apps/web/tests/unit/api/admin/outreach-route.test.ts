import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn(() => 'eq-clause'));
const mockAnd = vi.hoisted(() => vi.fn(() => 'and-clause'));
const mockAsc = vi.hoisted(() => vi.fn(() => 'asc-clause'));
const mockDesc = vi.hoisted(() => vi.fn(() => 'desc-clause'));
const mockCount = vi.hoisted(() => vi.fn(() => 'count-clause'));
const mockIsNotNull = vi.hoisted(() => vi.fn(() => 'not-null-clause'));

const { mockDb, mockSelect } = vi.hoisted(() => {
  const mockSelect = vi.fn();
  return {
    mockDb: { select: mockSelect },
    mockSelect,
  };
});

vi.mock('drizzle-orm', () => ({
  and: mockAnd,
  asc: mockAsc,
  count: mockCount,
  desc: mockDesc,
  eq: mockEq,
  isNotNull: mockIsNotNull,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/db/schema/leads', () => ({
  leads: {
    id: 'id',
    linktreeHandle: 'linktree-handle',
    linktreeUrl: 'linktree-url',
    discoverySource: 'discovery-source',
    discoveryQuery: 'discovery-query',
    displayName: 'display-name',
    bio: 'bio',
    avatarUrl: 'avatar-url',
    contactEmail: 'contact-email',
    hasPaidTier: 'has-paid-tier',
    hasSpotifyLink: 'has-spotify-link',
    spotifyUrl: 'spotify-url',
    hasInstagram: 'has-instagram',
    instagramHandle: 'instagram-handle',
    musicToolsDetected: 'music-tools-detected',
    allLinks: 'all-links',
    fitScore: 'fit-score',
    fitScoreBreakdown: 'fit-score-breakdown',
    status: 'status',
    disqualificationReason: 'disqualification-reason',
    qualifiedAt: 'qualified-at',
    disqualifiedAt: 'disqualified-at',
    approvedAt: 'approved-at',
    ingestedAt: 'ingested-at',
    rejectedAt: 'rejected-at',
    creatorProfileId: 'creator-profile-id',
    emailInvalid: 'email-invalid',
    emailSuspicious: 'email-suspicious',
    emailInvalidReason: 'email-invalid-reason',
    hasRepresentation: 'has-representation',
    representationSignal: 'representation-signal',
    outreachRoute: 'outreach-route',
    outreachStatus: 'outreach-status',
    claimToken: 'claim-token',
    claimTokenHash: 'claim-token-hash',
    claimTokenExpiresAt: 'claim-token-expires-at',
    instantlyLeadId: 'instantly-lead-id',
    outreachQueuedAt: 'outreach-queued-at',
    dmSentAt: 'dm-sent-at',
    dmCopy: 'dm-copy',
    scrapedAt: 'scraped-at',
    createdAt: 'created-at',
    updatedAt: 'updated-at',
    priorityScore: 'priority-score',
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

import { GET } from '@/app/api/admin/outreach/route';

describe('GET /api/admin/outreach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });
  });

  it('falls back to the legacy select when leads enrichment columns are missing', async () => {
    const legacyRows = [
      { id: 'lead-1', createdAt: new Date('2025-01-01T00:00:00.000Z') },
    ];

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
          where: vi.fn().mockResolvedValue([{ total: 1 }]),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn().mockResolvedValue(legacyRows),
              })),
            })),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ total: 1 }]),
        })),
      }));

    const request = {
      nextUrl: new URL(
        'http://localhost/api/admin/outreach?queue=all&page=1&limit=25'
      ),
    } as never;

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toEqual([
      {
        id: 'lead-1',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ]);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      '[admin/outreach] leads enrichment columns missing; falling back to legacy select',
      expect.any(Error),
      { route: '/api/admin/outreach' }
    );
  });
});
