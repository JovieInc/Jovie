import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DiscoveryKeyword,
  LeadPipelineSettings,
} from '@/lib/db/schema/leads';

const { searchMock, valuesMock, returningMock } = vi.hoisted(() => {
  const returningMock = vi.fn();
  const valuesMock = vi.fn(() => ({
    onConflictDoNothing: vi.fn(() => ({ returning: returningMock })),
  }));
  return { searchMock: vi.fn(), valuesMock, returningMock };
});

vi.mock('@/lib/leads/google-cse', () => ({ searchWebWithStatus: searchMock }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/leads/pipeline-logger', () => ({
  pipelineLog: vi.fn(),
  pipelineWarn: vi.fn(),
}));
vi.mock('@/lib/ingestion/strategies/linktree', () => ({
  isLinktreeUrl: (url: string) => url.includes('linktr.ee'),
  extractLinktreeHandle: (url: string) => url.split('/').at(-1) ?? null,
}));
vi.mock('@/lib/db', () => ({
  db: {
    execute: vi.fn(),
    insert: vi.fn(() => ({ values: valuesMock })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
  },
}));

const settings = {
  dailyQueryBudget: 1,
  queriesUsedToday: 0,
  lastDiscoveryQueryIndex: 0,
} as LeadPipelineSettings;

const keyword = {
  id: 'kw-1',
  query: 'site:linktr.ee "ffm.to"',
  enabled: true,
  resultsFoundTotal: 0,
  searchOffset: 1,
} as DiscoveryKeyword;

// Made-up candidates only.
const results = [
  {
    link: 'https://linktr.ee/fixture_buyer',
    title: 'Fixture Buyer | Linktree',
    snippet: 'New single ffm.to/fixture · Spotify · Tour dates',
  },
  {
    link: 'https://linktr.ee/fixture_reach_only',
    title: 'Fixture Reach | Linktree',
    snippet: 'Spotify · Apple Music · Instagram',
  },
  {
    link: 'https://linktr.ee/fixturerecords',
    title: 'Fixture Records | Linktree',
    snippet: 'Spotify · Laylo laylo.com/fixture',
  },
];

describe('runDiscovery buyer pre-screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchMock.mockResolvedValue({
      status: 'ok',
      provider: 'serpapi',
      results,
      error: null,
    });
    returningMock.mockResolvedValue([
      { id: 'lead-1', handle: 'fixture_buyer' },
    ]);
  });

  it('inserts only pre-screen passes and counts why the rest failed', async () => {
    const { runDiscovery } = await import('@/lib/leads/discovery');
    const result = await runDiscovery(settings, [keyword]);

    const leadInsert = valuesMock.mock.calls[0] as unknown as [
      Array<{ linktreeHandle: string }>,
    ];
    expect(leadInsert[0].map(c => c.linktreeHandle)).toEqual(['fixture_buyer']);
    expect(result.candidatesProcessed).toBe(3);
    expect(result.newLeadsFound).toBe(1);
    expect(result.prescreenFailReasons).toEqual({
      no_spend_signal: 1,
      non_artist: 1,
    });
    expect(result.diagnostics[0]).toMatchObject({
      prescreenPassed: 1,
      prescreenFailed: 2,
    });
  });

  it('records the paid-query cost per passed lead in the run log and lead event', async () => {
    const { runDiscovery } = await import('@/lib/leads/discovery');
    const result = await runDiscovery(settings, [keyword]);

    expect(result.cost).toEqual({
      estimatedQueryUsd: 0.015,
      passedLeads: 1,
      usdPerPassedLead: 0.015,
    });
    const eventInsert = valuesMock.mock.calls[1] as unknown as [
      { eventType: string; metadata: Record<string, unknown> },
    ];
    expect(eventInsert[0].eventType).toBe('discovered');
    expect(eventInsert[0].metadata).toMatchObject({
      discoverySource: 'google_cse',
      replacedTools: ['featurefm'],
      queryCostShareUsd: 0.015,
    });
    expect(eventInsert[0].metadata.prescreenReasons).toContain(
      'Feature.fm smart links (+25)'
    );
  });

  it('reports no cost per lead when nothing passes', async () => {
    searchMock.mockResolvedValue({
      status: 'ok',
      provider: 'exa',
      results: [results[1]],
      error: null,
    });
    const { runDiscovery } = await import('@/lib/leads/discovery');
    const result = await runDiscovery(settings, [keyword]);

    expect(valuesMock).not.toHaveBeenCalled();
    expect(result.cost).toEqual({
      estimatedQueryUsd: 0.005,
      passedLeads: 0,
      usdPerPassedLead: null,
    });
  });
});
