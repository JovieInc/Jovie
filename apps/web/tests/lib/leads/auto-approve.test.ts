import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Mock dependencies with vi.hoisted
const {
  mockDb,
  mockApproveLead,
  mockCaptureError,
  mockPipelineLog,
  mockPipelineWarn,
} = vi.hoisted(() => {
  const mockSelectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  const mockUpdateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  return {
    mockDb: {
      select: vi.fn().mockReturnValue(mockSelectChain),
      update: vi.fn().mockReturnValue(mockUpdateChain),
      insert: vi.fn().mockReturnThis(),
      _selectChain: mockSelectChain,
      _updateChain: mockUpdateChain,
    },
    mockApproveLead: vi.fn().mockResolvedValue({
      ingestion: { success: true, profileId: 'profile-1' },
      routing: { route: 'email' },
    }),
    mockCaptureError: vi.fn().mockResolvedValue(undefined),
    mockPipelineLog: vi.fn(),
    mockPipelineWarn: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/db/schema/leads', () => ({
  leads: {
    status: 'status',
    fitScore: 'fit_score',
    hasRepresentation: 'has_representation',
    spotifyFollowers: 'spotify_followers',
    spotifyPopularity: 'spotify_popularity',
  },
  leadPipelineSettings: { id: 'id' },
}));
vi.mock('@/lib/leads/approve-lead', () => ({ approveLead: mockApproveLead }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mockCaptureError }));
vi.mock('@/lib/leads/pipeline-logger', () => ({
  pipelineLog: mockPipelineLog,
  pipelineWarn: mockPipelineWarn,
}));

import type { LeadPipelineSettings } from '@/lib/db/schema/leads';
import { runAutoApprove } from '@/lib/leads/auto-approve';

function makeSettings(
  overrides: Partial<LeadPipelineSettings> = {}
): LeadPipelineSettings {
  return {
    id: 1,
    enabled: true,
    discoveryEnabled: true,
    autoIngestEnabled: true,
    autoIngestMinFitScore: 60,
    autoIngestDailyLimit: 10,
    autoIngestedToday: 0,
    autoIngestResetsAt: new Date(Date.now() + 86_400_000), // tomorrow
    dailyQueryBudget: 100,
    queriesUsedToday: 0,
    queryBudgetResetsAt: null,
    lastDiscoveryQueryIndex: 0,
    dmTemplate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    linktreeHandle: 'testartist',
    linktreeUrl: 'https://linktr.ee/testartist',
    status: 'qualified',
    fitScore: 75,
    hasRepresentation: false,
    spotifyFollowers: 1000,
    spotifyPopularity: 30,
    ...overrides,
  };
}

describe('runAutoApprove', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chain mocks
    mockDb._selectChain.from.mockReturnThis();
    mockDb._selectChain.where.mockReturnThis();
    mockDb._selectChain.orderBy.mockReturnThis();
    mockDb._selectChain.limit.mockResolvedValue([]);
    mockDb._updateChain.set.mockReturnThis();
    mockDb._updateChain.where.mockResolvedValue(undefined);
    mockDb.select.mockReturnValue(mockDb._selectChain);
    mockDb.update.mockReturnValue(mockDb._updateChain);
  });

  it('skips when autoIngestEnabled is false', async () => {
    const settings = makeSettings({ autoIngestEnabled: false });
    const result = await runAutoApprove(settings);
    expect(result).toEqual({
      skipped: true,
      reason: 'auto_ingest_disabled',
      approved: 0,
      errors: 0,
    });
    expect(mockApproveLead).not.toHaveBeenCalled();
  });

  it('skips when daily limit is reached', async () => {
    const settings = makeSettings({
      autoIngestedToday: 10,
      autoIngestDailyLimit: 10,
    });
    const result = await runAutoApprove(settings);
    expect(result).toEqual({
      skipped: true,
      reason: 'daily_limit_reached',
      approved: 0,
      errors: 0,
    });
  });

  it('returns 0 approved when no eligible leads found', async () => {
    const settings = makeSettings();
    mockDb._selectChain.limit.mockResolvedValue([]);

    const result = await runAutoApprove(settings);
    expect(result).toEqual({
      skipped: false,
      approved: 0,
      errors: 0,
    });
  });

  it('approves eligible leads and updates counter', async () => {
    const settings = makeSettings();
    const lead = makeLead();
    mockDb._selectChain.limit.mockResolvedValue([lead]);

    const result = await runAutoApprove(settings);
    expect(result.approved).toBe(1);
    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(false);
    expect(mockApproveLead).toHaveBeenCalledWith(lead);
    // Should update the counter
    expect(mockDb.update).toHaveBeenCalled();
  });

  it('counts errors when approveLead throws', async () => {
    const settings = makeSettings();
    const lead = makeLead();
    mockDb._selectChain.limit.mockResolvedValue([lead]);
    mockApproveLead.mockRejectedValueOnce(new Error('Ingest failed'));

    const result = await runAutoApprove(settings);
    expect(result.approved).toBe(0);
    expect(result.errors).toBe(1);
    expect(mockCaptureError).toHaveBeenCalled();
  });

  it('counts errors when ingestion.success is false', async () => {
    const settings = makeSettings();
    const lead = makeLead();
    mockDb._selectChain.limit.mockResolvedValue([lead]);
    mockApproveLead.mockResolvedValueOnce({
      ingestion: { success: false, error: 'Profile already claimed' },
      routing: null,
    });

    const result = await runAutoApprove(settings);
    expect(result.approved).toBe(0);
    expect(result.errors).toBe(1);
    expect(mockPipelineWarn).toHaveBeenCalledWith(
      'auto-approve',
      'Auto-approve ingestion failed',
      expect.objectContaining({ leadId: 'lead-1' })
    );
  });

  it('respects remaining slots (daily limit - already used)', async () => {
    const settings = makeSettings({
      autoIngestDailyLimit: 5,
      autoIngestedToday: 3,
    });
    const lead1 = makeLead({ id: 'lead-1' });
    const lead2 = makeLead({ id: 'lead-2' });
    mockDb._selectChain.limit.mockResolvedValue([lead1, lead2]);

    const result = await runAutoApprove(settings);
    // Should have called limit(2) since 5-3=2 remaining slots
    expect(mockDb._selectChain.limit).toHaveBeenCalledWith(2);
    expect(result.approved).toBe(2);
  });

  it('resets counter when past reset time', async () => {
    const settings = makeSettings({
      autoIngestedToday: 8,
      autoIngestResetsAt: new Date(Date.now() - 1000), // in the past
    });
    mockDb._selectChain.limit.mockResolvedValue([]);

    await runAutoApprove(settings);
    // Should have called update to reset counter
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb._updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ autoIngestedToday: 0 })
    );
  });
});
