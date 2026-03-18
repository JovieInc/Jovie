import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockQualifyLead,
  mockCaptureError,
  mockPipelineLog,
  mockPipelineWarn,
} = vi.hoisted(() => {
  const mockReturning = vi.fn().mockResolvedValue([{ scrapeAttempts: 1 }]);
  const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

  const mockSelectLimit = vi
    .fn()
    .mockResolvedValue([{ linktreeUrl: 'https://linktr.ee/test' }]);
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
    mockQualifyLead: vi.fn(),
    mockCaptureError: vi.fn().mockResolvedValue(undefined),
    mockPipelineLog: vi.fn(),
    mockPipelineWarn: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/db/schema/leads', () => ({
  leads: {
    id: 'id',
    linktreeUrl: 'linktree_url',
    scrapeAttempts: 'scrape_attempts',
  },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mockCaptureError }));
vi.mock('@/lib/leads/pipeline-logger', () => ({
  pipelineLog: mockPipelineLog,
  pipelineWarn: mockPipelineWarn,
}));
vi.mock('@/lib/leads/qualify', () => ({ qualifyLead: mockQualifyLead }));
vi.mock('@/lib/leads/constants', () => ({
  LEAD_QUALIFICATION_CONCURRENCY: 2,
  LINKTREE_FETCH_DELAY_MS: 0,
}));

import { processLeadBatch } from '@/lib/leads/process-batch';

describe('processLeadBatch — scrape retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb._selectLimit.mockResolvedValue([
      { linktreeUrl: 'https://linktr.ee/test' },
    ]);
    mockDb._updateSet.mockReturnValue({ where: mockDb._updateWhere });
    mockDb._updateWhere.mockReturnValue({ returning: mockDb._returning });
    mockDb._returning.mockResolvedValue([{ scrapeAttempts: 1 }]);
  });

  it('increments scrapeAttempts on qualification failure', async () => {
    mockQualifyLead.mockRejectedValueOnce(new Error('Network timeout'));

    const result = await processLeadBatch(['lead-1'], 1);

    expect(result.error).toBe(1);
    // Should have called update to increment scrapeAttempts
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Lead qualification failed',
      expect.any(Error),
      expect.any(Object)
    );
  });

  it('auto-disqualifies after 3 scrape failures', async () => {
    mockQualifyLead.mockRejectedValueOnce(new Error('Scrape failed'));
    // Return scrapeAttempts = 3 (just hit the threshold)
    mockDb._returning.mockResolvedValue([{ scrapeAttempts: 3 }]);

    const result = await processLeadBatch(['lead-1'], 1);

    expect(result.error).toBe(1);
    // Should have called update twice: once for scrapeAttempts, once for disqualify
    expect(mockDb.update).toHaveBeenCalledTimes(2);
    expect(mockDb._updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'disqualified',
        disqualificationReason: 'scrape_failed',
      })
    );
    expect(mockPipelineWarn).toHaveBeenCalledWith(
      'qualify',
      expect.stringContaining('max scrape attempts'),
      expect.objectContaining({ leadId: 'lead-1', attempts: 3 })
    );
  });

  it('does not disqualify when scrapeAttempts < 3', async () => {
    mockQualifyLead.mockRejectedValueOnce(new Error('Scrape failed'));
    mockDb._returning.mockResolvedValue([{ scrapeAttempts: 2 }]);

    await processLeadBatch(['lead-1'], 1);

    // Should only update scrapeAttempts, NOT set status to disqualified
    expect(mockDb._updateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'disqualified' })
    );
  });

  it('handles scrape attempt update failure gracefully', async () => {
    mockQualifyLead.mockRejectedValueOnce(new Error('Scrape failed'));
    // The scrape attempt update itself fails
    mockDb._updateWhere.mockReturnValueOnce({
      returning: vi.fn().mockRejectedValue(new Error('DB write failed')),
    });

    const result = await processLeadBatch(['lead-1'], 1);

    expect(result.error).toBe(1);
    // Should capture the nested error
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Failed to update scrape attempts',
      expect.any(Error),
      expect.any(Object)
    );
  });

  it('qualifies lead successfully on happy path', async () => {
    mockQualifyLead.mockResolvedValueOnce({
      status: 'qualified',
      displayName: 'Test',
      bio: null,
      avatarUrl: null,
      contactEmail: null,
      hasPaidTier: false,
      isLinktreeVerified: false,
      hasSpotifyLink: true,
      spotifyUrl: null,
      hasInstagram: false,
      instagramHandle: null,
      musicToolsDetected: [],
      allLinks: [],
      fitScore: 60,
      fitScoreBreakdown: {},
      disqualificationReason: null,
    });

    const result = await processLeadBatch(['lead-1'], 1);

    expect(result.qualified).toBe(1);
    expect(result.error).toBe(0);
  });
});
