import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockParseJsonBody = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockIngestLeadAsCreator = vi.hoisted(() => vi.fn());
const mockSpotifyEnrichLead = vi.hoisted(() => vi.fn());
const mockRouteLead = vi.hoisted(() => vi.fn());
const mockPushLeadToInstantly = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn(() => 'eq-clause'));

const { mockDb, mockLeadsSchema, mockUpdate, mockWhere, mockReturning } =
  vi.hoisted(() => {
    const mockReturning = vi.fn();
    const mockWhere = vi.fn();
    const mockSet = vi.fn(() => ({
      where: mockWhere,
    }));

    const mockUpdate = vi.fn(() => ({
      set: mockSet,
    }));

    const mockDb = { update: mockUpdate };
    const mockLeadsSchema = {
      id: 'id',
      status: 'status',
    };

    return {
      mockDb,
      mockLeadsSchema,
      mockUpdate,
      mockSet,
      mockWhere,
      mockReturning,
    };
  });

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/db/schema/leads', () => ({
  leads: mockLeadsSchema,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: mockParseJsonBody,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  getSafeErrorMessage: () => 'safe-error',
}));

vi.mock('@/lib/leads/ingest-lead', () => ({
  ingestLeadAsCreator: mockIngestLeadAsCreator,
}));

vi.mock('@/lib/leads/spotify-enrich-lead', () => ({
  spotifyEnrichLead: mockSpotifyEnrichLead,
}));

vi.mock('@/lib/leads/route-lead', () => ({
  routeLead: mockRouteLead,
}));

vi.mock('@/lib/leads/instantly', () => ({
  pushLeadToInstantly: mockPushLeadToInstantly,
}));

import { PATCH } from '@/app/api/admin/leads/[id]/route';

describe('PATCH /api/admin/leads/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });

    mockParseJsonBody.mockResolvedValue({
      ok: true,
      data: { status: 'approved' },
    });

    mockWhere.mockImplementation(() => ({ returning: mockReturning }));

    mockReturning.mockResolvedValue([
      {
        id: 'lead-1',
        linktreeUrl: 'https://linktr.ee/artist',
        contactEmail: 'artist@example.com',
        displayName: 'Artist',
        linktreeHandle: 'artist',
        priorityScore: 66,
      },
    ]);

    mockIngestLeadAsCreator.mockResolvedValue({ success: true });
    mockSpotifyEnrichLead.mockResolvedValue(undefined);
    mockRouteLead.mockResolvedValue({
      route: 'email',
      claimUrl: 'https://jovie.com/claim/token',
      dmCopy: null,
    });
    mockPushLeadToInstantly.mockResolvedValue('instantly-123');
  });

  it('returns 401 when user is not authenticated', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: false,
      isAdmin: false,
    });

    const response = await PATCH(new Request('http://localhost') as never, {
      params: Promise.resolve({ id: 'lead-1' }),
    });

    expect(response.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('approves lead and queues Instantly outreach for email routes', async () => {
    const response = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' }),
      }) as never,
      {
        params: Promise.resolve({ id: 'lead-1' }),
      }
    );

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockIngestLeadAsCreator).toHaveBeenCalled();
    expect(mockSpotifyEnrichLead).toHaveBeenCalledWith('lead-1');
    expect(mockRouteLead).toHaveBeenCalledWith('lead-1');
    expect(mockPushLeadToInstantly).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'artist@example.com' })
    );

    // First update = status update; second update = queue metadata update
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(data.routing).toEqual(
      expect.objectContaining({
        route: 'email',
        instantlyLeadId: 'instantly-123',
        outreachStatus: 'queued',
      })
    );
  });
});
