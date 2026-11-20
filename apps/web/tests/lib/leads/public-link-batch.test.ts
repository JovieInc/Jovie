import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  observePublicLinkPage,
  publicPageSignalSnapshot,
} from '@/lib/leads/public-link-observation';

const { mockDb, mockQualifyLead, mockRecordEvent, fetchSpy } = vi.hoisted(
  () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const selectLimit = vi.fn();
    return {
      mockDb: {
        update: vi.fn().mockReturnValue({ set: updateSet }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: selectLimit }),
          }),
        }),
        _updateSet: updateSet,
        _selectLimit: selectLimit,
      },
      mockQualifyLead: vi.fn(),
      mockRecordEvent: vi.fn().mockResolvedValue(undefined),
      fetchSpy: vi.fn(),
    };
  }
);

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/leads/pipeline-logger', () => ({
  pipelineLog: vi.fn(),
  pipelineWarn: vi.fn(),
}));
vi.mock('@/lib/leads/funnel-events', () => ({
  recordLeadFunnelEvent: mockRecordEvent,
}));
vi.mock('@/lib/leads/qualify', () => ({ qualifyLead: mockQualifyLead }));
vi.mock('@/lib/leads/constants', () => ({
  LEAD_QUALIFICATION_CONCURRENCY: 2,
  LINKTREE_FETCH_DELAY_MS: 0,
}));

import { processLeadBatch } from '@/lib/leads/process-batch';

const OBSERVED_AT = '2026-11-19T00:00:00.000Z';

function observed(url: string, displayName: string, text?: string) {
  const page = observePublicLinkPage({
    url,
    displayName,
    text,
    links: [
      { url: 'https://open.spotify.com/artist/fixture' },
      { url: 'https://ffm.to/fixture-single' },
    ],
    observedAt: OBSERVED_AT,
  });
  if (!page) throw new Error(url);
  return page;
}

function lead(page: ReturnType<typeof observed>) {
  return {
    linktreeUrl: page.url,
    linktreeHandle: 'stored-handle',
    sourceHandle: null,
    sourcePlatform: 'linktree',
    displayName: null,
    discoveryQuery: null,
    signalSnapshot: publicPageSignalSnapshot(page),
  };
}

describe('processLeadBatch — public page snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchSpy);
    mockDb._updateSet.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('qualifies a Feature.fm page stored under the linktree enum without fetching', async () => {
    mockDb._selectLimit.mockResolvedValue([
      lead(observed('https://ffm.to/northline', 'Northline')),
    ]);

    const result = await processLeadBatch(['lead-1'], 1);
    const update = mockDb._updateSet.mock.calls.at(-1)?.[0] as {
      status: string;
      hasRepresentation: boolean;
    };

    expect(result.qualified).toBe(1);
    expect(update.status).toBe('qualified');
    expect(update.hasRepresentation).toBe(false);
    expect(mockQualifyLead).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          qualificationSource: 'public_page',
        }),
      }),
      { idempotent: true }
    );
  });

  it('disqualifies a contest page from the stored snapshot', async () => {
    mockDb._selectLimit.mockResolvedValue([
      lead(
        observed(
          'https://ffm.to/win-a-copy',
          'Enter to win a copy of the single'
        )
      ),
    ]);

    const result = await processLeadBatch(['lead-1'], 1);
    const update = mockDb._updateSet.mock.calls.at(-1)?.[0] as {
      status: string;
      disqualificationReason: string;
    };

    expect(result.disqualified).toBe(1);
    expect(update.status).toBe('disqualified');
    expect(update.disqualificationReason).toBe('contest_or_giveaway');
    expect(mockQualifyLead).not.toHaveBeenCalled();
  });

  it('keeps a relationship hold qualified and flagged', async () => {
    mockDb._selectLimit.mockResolvedValue([
      lead(observed('https://linktr.ee/djdannic', 'Dannic')),
    ]);

    const result = await processLeadBatch(['lead-1'], 1);
    const update = mockDb._updateSet.mock.calls.at(-1)?.[0] as {
      status: string;
      hasRepresentation: boolean;
      representationSignal: string;
    };

    expect(result.qualified).toBe(1);
    expect(update.status).toBe('qualified');
    expect(update.hasRepresentation).toBe(true);
    expect(update.representationSignal).toMatch(/Dannic/i);
  });
});
