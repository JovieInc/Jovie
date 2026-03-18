import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockParseJsonBody = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockApproveLead = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn(() => 'eq-clause'));

const {
  mockDb,
  mockLeadsSchema,
  mockUpdate,
  mockWhere,
  mockReturning,
  mockSelectLimit,
} = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockWhere = vi.fn();
  const mockSet = vi.fn(() => ({
    where: mockWhere,
  }));

  const mockUpdate = vi.fn(() => ({
    set: mockSet,
  }));

  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

  const mockDb = {
    update: mockUpdate,
    select: mockSelect,
  };
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
    mockSelectFrom,
    mockSelectWhere,
    mockSelectLimit,
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

vi.mock('@/lib/leads/approve-lead', () => ({
  approveLead: mockApproveLead,
}));

vi.mock('@/lib/leads/pipeline-logger', () => ({
  pipelineLog: vi.fn(),
}));

import { PATCH } from '@/app/api/admin/leads/[id]/route';

describe('PATCH /api/admin/leads/[id]', () => {
  const mockLead = {
    id: 'lead-1',
    linktreeUrl: 'https://linktr.ee/artist',
    contactEmail: 'artist@example.com',
    displayName: 'Artist',
    linktreeHandle: 'artist',
    priorityScore: 66,
    status: 'qualified',
  };

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

    // Select returns the lead for the approval flow
    mockSelectLimit.mockResolvedValue([mockLead]);

    // Update returns the updated lead for the rejection flow
    mockWhere.mockImplementation(() => ({ returning: mockReturning }));
    mockReturning.mockResolvedValue([{ ...mockLead, status: 'rejected' }]);

    mockApproveLead.mockResolvedValue({
      ingestion: { success: true, profileId: 'profile-1' },
      routing: {
        route: 'email',
        instantlyLeadId: 'instantly-123',
        outreachStatus: 'queued',
      },
    });
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

  it('approves lead via shared approveLead pipeline', async () => {
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
    expect(mockApproveLead).toHaveBeenCalledWith(mockLead);
    expect(data.routing).toEqual(
      expect.objectContaining({
        route: 'email',
        outreachStatus: 'queued',
      })
    );
    expect(data.ingestion).toEqual(
      expect.objectContaining({
        success: true,
        profileId: 'profile-1',
      })
    );
  });
});
