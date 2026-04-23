import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());
const mockParseJsonBody = vi.hoisted(() => vi.fn());
const mockPushLeadToInstantly = vi.hoisted(() => vi.fn());
const mockGetAppUrl = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn(() => 'eq-clause'));
const mockGte = vi.hoisted(() => vi.fn(() => 'gte-clause'));
const mockAnd = vi.hoisted(() => vi.fn(() => 'and-clause'));
const mockAsc = vi.hoisted(() => vi.fn(() => 'asc-clause'));
const mockDesc = vi.hoisted(() => vi.fn(() => 'desc-clause'));
const mockCount = vi.hoisted(() => vi.fn(() => 'count-clause'));
const mockIsNotNull = vi.hoisted(() => vi.fn(() => 'not-null-clause'));
const mockIsNull = vi.hoisted(() => vi.fn(() => 'is-null-clause'));
const mockLt = vi.hoisted(() => vi.fn(() => 'lt-clause'));
const mockNe = vi.hoisted(() => vi.fn(() => 'ne-clause'));
const mockOr = vi.hoisted(() => vi.fn(() => 'or-clause'));
const mockSql = vi.hoisted(() => vi.fn(() => 'sql-clause'));

const {
  mockDb,
  mockExecute,
  mockInsert,
  mockSelect,
  mockUpdate,
  mockUpdateReturning,
} = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockExecute = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdateReturning = vi.fn();
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }));
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));
  // Advisory-lock execute() inside the claim transaction must resolve truthy
  // so processOutreachBatch proceeds. Default to locked=true.
  const mockTxExecute = vi.fn().mockResolvedValue({ rows: [{ locked: true }] });
  const mockTransaction = vi.fn(async (cb: (tx: unknown) => unknown) =>
    cb({
      select: mockSelect,
      update: mockUpdate,
      execute: mockTxExecute,
      insert: mockInsert,
    })
  );
  return {
    mockDb: {
      select: mockSelect,
      update: mockUpdate,
      execute: mockExecute,
      insert: mockInsert,
      transaction: mockTransaction,
    },
    mockExecute,
    mockInsert,
    mockSelect,
    mockUpdate,
    mockUpdateSet,
    mockUpdateWhere,
    mockUpdateReturning,
  };
});

vi.mock('drizzle-orm', () => ({
  and: mockAnd,
  asc: mockAsc,
  count: mockCount,
  desc: mockDesc,
  eq: mockEq,
  gte: mockGte,
  isNotNull: mockIsNotNull,
  isNull: mockIsNull,
  lt: mockLt,
  ne: mockNe,
  or: mockOr,
  sql: mockSql,
}));

vi.mock('@/constants/domains', () => ({
  getAppUrl: mockGetAppUrl,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/notifications/suppression', () => ({
  isEmailSuppressed: vi.fn().mockResolvedValue({ suppressed: false }),
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
    firstContactedAt: 'first-contacted-at',
    lastContactedAt: 'last-contacted-at',
    dmCopy: 'dm-copy',
    scrapedAt: 'scraped-at',
    createdAt: 'created-at',
    updatedAt: 'updated-at',
    priorityScore: 'priority-score',
  },
  leadPipelineSettings: {
    id: 'lead-pipeline-settings-id',
  },
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: mockParseJsonBody,
}));

vi.mock('@/lib/leads/instantly', () => ({
  pushLeadToInstantly: mockPushLeadToInstantly,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  captureWarning: mockCaptureWarning,
  getSafeErrorMessage: () => 'safe-error',
}));

import { GET, POST } from '@/app/api/admin/outreach/route';

describe('GET /api/admin/outreach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
    mockSelect.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ total: 0 }]),
      })),
    }));
    mockExecute.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockUpdateReturning.mockReset();
    mockGetCurrentUserEntitlements.mockReset();
    mockGetAppUrl.mockReset();
    mockParseJsonBody.mockReset();
    mockPushLeadToInstantly.mockReset();
    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });
    mockGetAppUrl.mockReturnValue('https://app.jovie.test/claim/token');
    mockParseJsonBody.mockResolvedValue({
      ok: true,
      data: { limit: 2 },
    });
    mockUpdateReturning.mockResolvedValue([{ id: 'lead-1' }]);
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
    expect(data.pendingTotal).toBe(1);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      '[admin/outreach] leads schema columns missing; falling back to legacy select',
      expect.any(Error),
      { route: '/api/admin/outreach' }
    );
  });

  it('queues pending email outreach only when explicitly triggered', async () => {
    mockSelect
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                dailySendCap: 10,
                maxPerHour: 5,
              },
            ]),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ total: 0 }]),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ total: 0 }]),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'lead-1',
                  linktreeHandle: 'artist',
                  displayName: 'Artist',
                  contactEmail: 'artist@example.com',
                  claimToken: 'claim-token',
                  priorityScore: 88,
                },
              ]),
            })),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ total: 0 }]),
        })),
      }));

    mockPushLeadToInstantly.mockResolvedValue('instantly-123');

    const response = await POST(
      new Request('http://localhost/api/admin/outreach', {
        method: 'POST',
        body: JSON.stringify({ limit: 1 }),
      }) as never
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockParseJsonBody).toHaveBeenCalled();
    expect(mockOr).toHaveBeenCalledWith('eq-clause', 'eq-clause');
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockPushLeadToInstantly).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'artist@example.com',
        claimLink: 'https://app.jovie.test/claim/token',
        priorityScore: 88,
      })
    );
    expect(data).toEqual({
      ok: true,
      attempted: 1,
      queued: 1,
      failed: 0,
      dismissed: 0,
      remainingPending: 0,
    });
  });

  it('skips leads already claimed by another queue request', async () => {
    mockSelect
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                dailySendCap: 10,
                maxPerHour: 5,
              },
            ]),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ total: 0 }]),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ total: 0 }]),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'lead-1',
                  linktreeHandle: 'artist',
                  displayName: 'Artist',
                  contactEmail: 'artist@example.com',
                  claimToken: 'claim-token',
                  priorityScore: 88,
                },
              ]),
            })),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ total: 1 }]),
        })),
      }));

    mockUpdateReturning.mockResolvedValueOnce([]);

    const response = await POST(
      new Request('http://localhost/api/admin/outreach', {
        method: 'POST',
        body: JSON.stringify({ limit: 1 }),
      }) as never
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockPushLeadToInstantly).not.toHaveBeenCalled();
    expect(data).toEqual({
      ok: true,
      attempted: 0,
      queued: 0,
      failed: 0,
      dismissed: 0,
      remainingPending: 1,
    });
  });
});
