import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LeadSearchEvidence } from '@/lib/db/schema/leads';

const {
  mockDb,
  mockQualifyLead,
  mockFetchBeaconsDocument,
  mockRecordEvent,
  fetchSpy,
} = vi.hoisted(() => {
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
    mockFetchBeaconsDocument: vi.fn(),
    mockRecordEvent: vi.fn().mockResolvedValue(undefined),
    fetchSpy: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/leads/pipeline-logger', () => ({
  pipelineLog: vi.fn(),
  pipelineWarn: vi.fn(),
}));
vi.mock('@/lib/leads/funnel-events', () => ({
  recordLeadFunnelEvent: mockRecordEvent,
}));
// The only page readers this module could reach; neither may run.
vi.mock('@/lib/leads/qualify', () => ({ qualifyLead: mockQualifyLead }));
vi.mock('@/lib/ingestion/strategies/beacons', () => ({
  fetchBeaconsDocument: mockFetchBeaconsDocument,
}));
vi.mock('@/lib/leads/constants', () => ({
  LEAD_QUALIFICATION_CONCURRENCY: 2,
  LINKTREE_FETCH_DELAY_MS: 0,
}));

import { processLeadBatch } from '@/lib/leads/process-batch';

// Made-up search results only.
function evidence(
  query: string,
  tools: string[],
  domains: string[],
  snippet: string | null = null
): LeadSearchEvidence {
  return {
    source: 'search_match',
    query,
    provider: 'serpapi',
    tools,
    domains,
    title: 'Fixture Artist',
    snippet,
    observedAt: '2026-11-08T00:00:00.000Z',
  };
}

function lead(overrides: Record<string, unknown>) {
  return {
    linktreeUrl: 'https://linktr.ee/fixture_artist',
    linktreeHandle: 'fixture_artist',
    sourceHandle: 'fixture_artist',
    sourcePlatform: 'linktree',
    displayName: null,
    discoveryQuery: null,
    signalSnapshot: null,
    ...overrides,
  };
}

function lastSet(): Record<string, unknown> {
  return mockDb._updateSet.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

function expectNoPageRead() {
  expect(mockQualifyLead).not.toHaveBeenCalled();
  expect(mockFetchBeaconsDocument).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
}

describe('processLeadBatch — Linktree and Beacons leads from search evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchSpy);
  });

  it('qualifies from the tools Google matched on the page, summed across queries', async () => {
    mockDb._selectLimit.mockResolvedValue([
      lead({
        signalSnapshot: {
          searchEvidence: [
            evidence('site:linktr.ee "laylo.com"', ['laylo'], ['laylo.com']),
            evidence(
              'site:linktr.ee "bandsintown.com"',
              ['touring'],
              ['bandsintown.com']
            ),
          ],
        },
      }),
    ]);

    const result = await processLeadBatch(['lead-1'], 1);

    expect(result.qualified).toBe(1);
    expect(lastSet()).toMatchObject({
      status: 'qualified',
      displayName: 'Fixture Artist',
      fitScore: 40,
      musicToolsDetected: ['laylo'],
      disqualificationReason: null,
      fitScoreBreakdown: expect.objectContaining({
        source: 'search_evidence',
        searchTools: ['laylo', 'touring'],
      }),
    });
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        eventType: 'qualified',
        metadata: expect.objectContaining({
          qualificationSource: 'search_evidence',
        }),
      }),
      { idempotent: true }
    );
    expectNoPageRead();
  });

  it('qualifies a Beacons lead the same way without reading beacons.ai', async () => {
    mockDb._selectLimit.mockResolvedValue([
      lead({
        linktreeUrl: 'https://beacons.ai/fixtureband',
        linktreeHandle: 'beacons:fixtureband',
        sourceHandle: 'fixtureband',
        sourcePlatform: 'beacons',
        signalSnapshot: {
          searchEvidence: [
            evidence('site:beacons.ai "ffm.to"', ['featurefm'], ['ffm.to']),
          ],
        },
      }),
    ]);

    const result = await processLeadBatch(['lead-b'], 1);

    expect(result.qualified).toBe(1);
    expect(lastSet()).toMatchObject({ status: 'qualified', fitScore: 25 });
    expectNoPageRead();
  });

  it('leaves a lead with no search evidence discovered and rotates past it', async () => {
    mockDb._selectLimit.mockResolvedValue([lead({})]);

    const result = await processLeadBatch(['lead-2'], 1);

    expect(result.deferred).toBe(1);
    expect(mockDb._updateSet).toHaveBeenCalledTimes(1);
    expect(mockDb._updateSet).toHaveBeenCalledWith({
      updatedAt: expect.any(Date),
    });
    expect(mockRecordEvent).not.toHaveBeenCalled();
    expectNoPageRead();
  });

  it('disqualifies on the pre-screen pass mark and hard stops', async () => {
    mockDb._selectLimit.mockResolvedValueOnce([
      lead({
        signalSnapshot: {
          searchEvidence: [
            evidence(
              'site:linktr.ee "bandsintown.com"',
              ['touring'],
              ['bandsintown.com']
            ),
          ],
        },
      }),
    ]);
    await processLeadBatch(['lead-3'], 1);
    expect(lastSet()).toMatchObject({
      status: 'disqualified',
      fitScore: 15,
      disqualificationReason: 'score_below_threshold',
    });

    mockDb._selectLimit.mockResolvedValueOnce([
      lead({
        signalSnapshot: {
          searchEvidence: [
            evidence(
              'site:linktr.ee "laylo.com"',
              ['laylo'],
              ['laylo.com'],
              'Music PR campaigns for indie artists'
            ),
          ],
        },
      }),
    ]);
    const result = await processLeadBatch(['lead-4'], 1);
    expect(result.disqualified).toBe(1);
    expect(lastSet()).toMatchObject({
      status: 'disqualified',
      disqualificationReason: 'non_artist',
    });
    expectNoPageRead();
  });

  it('treats any blocked link-page host as search-only, whatever the source', async () => {
    mockDb._selectLimit.mockResolvedValue([
      lead({ sourcePlatform: null, linktreeUrl: 'https://www.linktr.ee/x' }),
    ]);

    const result = await processLeadBatch(['lead-5'], 1);

    expect(result.deferred).toBe(1);
    expectNoPageRead();
  });
});
