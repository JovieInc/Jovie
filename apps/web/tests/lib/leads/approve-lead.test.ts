import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockDb,
  mockIngestLeadAsCreator,
  mockSpotifyEnrichLead,
  mockRouteLead,
  mockPushLeadToInstantly,
  mockCaptureError,
  mockPipelineLog,
  mockPipelineWarn,
} = vi.hoisted(() => {
  const mockReturning = vi.fn().mockResolvedValue([{ id: 'lead-1' }]);
  const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

  const mockSelectLimit = vi.fn().mockResolvedValue([]);
  const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockSelectLimit });
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

  return {
    mockDb: {
      update: mockUpdate,
      select: mockSelect,
      _updateSet: mockUpdateSet,
      _updateWhere: mockUpdateWhere,
      _returning: mockReturning,
      _selectLimit: mockSelectLimit,
    },
    mockIngestLeadAsCreator: vi
      .fn()
      .mockResolvedValue({ success: true, profileId: 'p-1' }),
    mockSpotifyEnrichLead: vi.fn().mockResolvedValue(undefined),
    mockRouteLead: vi
      .fn()
      .mockResolvedValue({ route: 'email', claimUrl: 'https://app/claim/tok' }),
    mockPushLeadToInstantly: vi.fn().mockResolvedValue('instantly-lead-1'),
    mockCaptureError: vi.fn().mockResolvedValue(undefined),
    mockPipelineLog: vi.fn(),
    mockPipelineWarn: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/db/schema/leads', () => ({
  leads: {
    id: 'id',
    status: 'status',
    instantlyLeadId: 'instantly_lead_id',
  },
}));
vi.mock('@/lib/leads/ingest-lead', () => ({
  ingestLeadAsCreator: mockIngestLeadAsCreator,
}));
vi.mock('@/lib/leads/spotify-enrich-lead', () => ({
  spotifyEnrichLead: mockSpotifyEnrichLead,
}));
vi.mock('@/lib/leads/route-lead', () => ({ routeLead: mockRouteLead }));
vi.mock('@/lib/leads/instantly', () => ({
  pushLeadToInstantly: mockPushLeadToInstantly,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mockCaptureError }));
vi.mock('@/lib/leads/pipeline-logger', () => ({
  pipelineLog: mockPipelineLog,
  pipelineWarn: mockPipelineWarn,
}));

import type { Lead } from '@/lib/db/schema/leads';
import { approveLead } from '@/lib/leads/approve-lead';

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    linktreeHandle: 'testartist',
    linktreeUrl: 'https://linktr.ee/testartist',
    status: 'qualified',
    fitScore: 75,
    hasRepresentation: false,
    contactEmail: 'test@example.com',
    emailInvalid: false,
    displayName: 'Test Artist',
    instantlyLeadId: null,
    claimToken: null,
    claimTokenHash: null,
    claimTokenExpiresAt: null,
    ...overrides,
  } as Lead;
}

describe('approveLead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: update returns a row (lead was in qualified state)
    mockDb._returning.mockResolvedValue([{ id: 'lead-1' }]);
    // Default: re-fetch after routing returns the lead with email
    mockDb._selectLimit.mockResolvedValue([
      makeLead({ contactEmail: 'test@example.com', emailInvalid: false }),
    ]);
  });

  it('skips pipeline when lead is not in qualified state (atomic guard)', async () => {
    // Simulate: WHERE status='qualified' matches 0 rows → returning is empty
    mockDb._returning.mockResolvedValue([]);

    const lead = makeLead({ status: 'approved' });
    const result = await approveLead(lead);

    expect(result).toEqual({ ingestion: null, routing: null });
    expect(mockIngestLeadAsCreator).not.toHaveBeenCalled();
    expect(mockSpotifyEnrichLead).not.toHaveBeenCalled();
    expect(mockRouteLead).not.toHaveBeenCalled();
    expect(mockPipelineLog).toHaveBeenCalledWith(
      'approve',
      expect.stringContaining('already approved'),
      expect.any(Object)
    );
  });

  it('continues routing when Spotify enrichment fails', async () => {
    mockSpotifyEnrichLead.mockRejectedValueOnce(new Error('Spotify API down'));

    const lead = makeLead();
    const result = await approveLead(lead);

    // Should still route despite enrichment failure
    expect(mockRouteLead).toHaveBeenCalledWith('lead-1');
    expect(result.routing).toBeTruthy();
    expect(mockPipelineWarn).toHaveBeenCalledWith(
      'approve',
      expect.stringContaining('Spotify enrichment failed'),
      expect.any(Object)
    );
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Spotify enrichment failed during approval',
      expect.any(Error),
      expect.any(Object)
    );
  });

  it('skips Instantly push when instantlyLeadId already set (idempotency)', async () => {
    mockDb._selectLimit.mockResolvedValue([
      makeLead({ instantlyLeadId: 'existing-instantly-id' }),
    ]);

    const lead = makeLead();
    const result = await approveLead(lead);

    expect(mockPushLeadToInstantly).not.toHaveBeenCalled();
    expect(mockPipelineLog).toHaveBeenCalledWith(
      'approve',
      expect.stringContaining('Already pushed to Instantly'),
      expect.any(Object)
    );
    expect(result.routing?.route).toBe('email');
  });

  it('captures error and returns result when routing fails', async () => {
    mockRouteLead.mockRejectedValueOnce(new Error('Route DB error'));

    const lead = makeLead();
    const result = await approveLead(lead);

    expect(result.routing?.error).toBe('Route DB error');
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Lead routing failed',
      expect.any(Error),
      expect.any(Object)
    );
  });

  it('runs full pipeline on happy path', async () => {
    const lead = makeLead();
    const result = await approveLead(lead);

    expect(mockIngestLeadAsCreator).toHaveBeenCalledWith(lead);
    expect(mockSpotifyEnrichLead).toHaveBeenCalledWith('lead-1');
    expect(mockRouteLead).toHaveBeenCalledWith('lead-1');
    expect(result.ingestion?.success).toBe(true);
    expect(result.routing?.route).toBe('email');
  });
});
