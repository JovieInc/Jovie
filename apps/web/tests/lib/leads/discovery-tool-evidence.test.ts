import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DiscoveryKeyword,
  LeadPipelineSettings,
  LeadSearchEvidence,
  LeadSignalSnapshot,
} from '@/lib/db/schema/leads';

const {
  searchMock,
  valuesMock,
  returningMock,
  existingLeadRows,
  updateSetMock,
  fetchSpy,
} = vi.hoisted(() => {
  const returningMock = vi.fn();
  const valuesMock = vi.fn(() => ({
    onConflictDoNothing: vi.fn(() => ({ returning: returningMock })),
  }));
  return {
    searchMock: vi.fn(),
    valuesMock,
    returningMock,
    existingLeadRows: { current: [] as Record<string, unknown>[] },
    updateSetMock: vi.fn(() => ({ where: vi.fn() })),
    fetchSpy: vi.fn(),
  };
});

vi.mock('@/lib/leads/google-cse', () => ({ searchWebWithStatus: searchMock }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/leads/funnel-events', () => ({
  recordLeadFunnelEvent: vi.fn(),
}));
vi.mock('@/lib/leads/pipeline-logger', () => ({
  pipelineLog: vi.fn(),
  pipelineWarn: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    execute: vi.fn(),
    insert: vi.fn(() => ({ values: valuesMock })),
    update: vi.fn(() => ({ set: updateSetMock })),
    // Seen-checks call .limit(); the duplicate evidence merge awaits .where().
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() =>
          Object.assign(Promise.resolve(existingLeadRows.current), {
            limit: vi.fn(async () => []),
          })
        ),
      })),
    })),
  },
}));

// One query per run, so a single keyword is searched once.
const settings = {
  dailyQueryBudget: 1,
  queriesUsedToday: 0,
  lastDiscoveryQueryIndex: 0,
} as LeadPipelineSettings;

function keyword(query: string, id = 'kw-1'): DiscoveryKeyword {
  return {
    id,
    query,
    enabled: true,
    resultsFoundTotal: 0,
    searchOffset: 1,
  } as DiscoveryKeyword;
}

function serp(
  results: Array<{ link: string; title: string; snippet: string }>
) {
  return { status: 'ok', provider: 'serpapi', results, error: null };
}

/** Lead rows the insert was given (made-up candidates only). */
function insertedLeads(): Array<{
  linktreeHandle: string;
  sourcePlatform: string;
  sourceHandle: string;
  signalSnapshot: LeadSignalSnapshot;
}> {
  const call = valuesMock.mock.calls.find(args =>
    Array.isArray((args as unknown[])[0])
  ) as unknown as [never[]] | undefined;
  return call?.[0] ?? [];
}

describe('runDiscovery search-side tool evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existingLeadRows.current = [];
    returningMock.mockResolvedValue([]);
    vi.stubGlobal('fetch', fetchSpy);
  });

  it('records the tool a quoted query matched as search_match evidence', async () => {
    searchMock.mockResolvedValue(
      serp([
        {
          link: 'https://linktr.ee/fixture_drops',
          title: 'Fixture Drops | Linktree',
          snippet: 'New music every Friday',
        },
      ])
    );
    returningMock.mockResolvedValue([
      { id: 'lead-1', handle: 'fixture_drops' },
    ]);
    const { runDiscovery } = await import('@/lib/leads/discovery');

    const result = await runDiscovery(settings, [
      keyword('site:linktr.ee "laylo.com"'),
    ]);

    expect(result.newLeadsFound).toBe(1);
    const [lead] = insertedLeads();
    expect(lead?.linktreeHandle).toBe('fixture_drops');
    expect(lead?.signalSnapshot.searchEvidence).toEqual([
      expect.objectContaining({
        source: 'search_match',
        query: 'site:linktr.ee "laylo.com"',
        provider: 'serpapi',
        tools: ['laylo'],
        domains: ['laylo.com'],
        title: 'Fixture Drops',
      }),
    ]);
    // The search engine read the page; Jovie never requests it.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keys Beacons pages apart from Linktree handles', async () => {
    searchMock.mockResolvedValue(
      serp([
        {
          link: 'https://beacons.ai/fixtureband',
          title: 'Fixture Band | Beacons',
          snippet: 'Our new single',
        },
      ])
    );
    returningMock.mockResolvedValue([
      { id: 'lead-b', handle: 'beacons:fixtureband' },
    ]);
    const { runDiscovery } = await import('@/lib/leads/discovery');

    await runDiscovery(settings, [keyword('site:beacons.ai "ffm.to"')]);

    expect(insertedLeads()[0]).toMatchObject({
      linktreeHandle: 'beacons:fixtureband',
      sourcePlatform: 'beacons',
      sourceHandle: 'fixtureband',
      signalSnapshot: {
        sourcePlatform: 'beacons',
        searchEvidence: [expect.objectContaining({ tools: ['featurefm'] })],
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['a passing query', 'site:linktr.ee "laylo.com"', 'laylo'],
    ['a budget-only query', 'site:linktr.ee "bandsintown.com"', 'touring'],
  ])('merges %s into a lead already on file', async (_label, query, tool) => {
    const earlier: LeadSearchEvidence = {
      source: 'search_match',
      query: 'site:linktr.ee "ffm.to"',
      provider: 'serpapi',
      tools: ['featurefm'],
      domains: ['ffm.to'],
      title: 'Fixture Drops',
      snippet: null,
      observedAt: '2026-11-01T00:00:00.000Z',
    };
    existingLeadRows.current = [
      {
        id: 'lead-1',
        handle: 'fixture_drops',
        signalSnapshot: {
          discoveryQuery: earlier.query,
          searchEvidence: [earlier],
        },
      },
    ];
    searchMock.mockResolvedValue(
      serp([
        {
          link: 'https://linktr.ee/fixture_drops',
          title: 'Fixture Drops | Linktree',
          snippet: '',
        },
      ])
    );
    // Conflict: the lead exists, so nothing is inserted.
    returningMock.mockResolvedValue([]);
    const { runDiscovery } = await import('@/lib/leads/discovery');

    await runDiscovery(settings, [keyword(query)]);

    const merge = updateSetMock.mock.calls.find(
      args => 'signalSnapshot' in ((args as unknown[])[0] as object)
    ) as unknown as [{ signalSnapshot: LeadSignalSnapshot }] | undefined;
    expect(merge?.[0].signalSnapshot.discoveryQuery).toBe(earlier.query);
    expect(
      merge?.[0].signalSnapshot.searchEvidence?.map(entry => entry.tools)
    ).toEqual([['featurefm'], [tool]]);
  });

  it('labels a spend signal that scored under the pass mark score_below_threshold', async () => {
    searchMock.mockResolvedValue(
      serp([
        {
          link: 'https://linktr.ee/fixture_tourer',
          title: 'Fixture Tourer | Linktree',
          snippet: 'Tour dates · Spotify',
        },
        {
          link: 'https://linktr.ee/fixture_reach',
          title: 'Fixture Reach | Linktree',
          snippet: 'Spotify · Apple Music',
        },
      ])
    );
    const { runDiscovery } = await import('@/lib/leads/discovery');

    const result = await runDiscovery(settings, [
      keyword('site:linktr.ee indie artist'),
    ]);

    // Touring (+15) is a spend signal but under the pass mark of 25.
    expect(result.prescreenFailReasons).toEqual({
      score_below_threshold: 1,
      no_spend_signal: 1,
    });
  });

  it('never runs more than the per-run search cap, rotating tool queries across runs', async () => {
    const { buildToolSearchQueries } = await import(
      '@/lib/leads/search-evidence'
    );
    const queries = buildToolSearchQueries();
    expect(queries.length).toBeGreaterThan(10);
    const keywords = queries.map((query, index) =>
      keyword(query, `kw-${index}`)
    );
    searchMock.mockResolvedValue(serp([]));
    const { runDiscovery } = await import('@/lib/leads/discovery');

    const roomy = { ...settings, dailyQueryBudget: 100 };
    const first = await runDiscovery(roomy, keywords);
    expect(searchMock).toHaveBeenCalledTimes(10);
    expect(first.queriesUsed).toBe(10);
    expect(first.keywordRotationIndex).toBe(10);

    searchMock.mockClear();
    const second = await runDiscovery(
      { ...roomy, lastDiscoveryQueryIndex: first.keywordRotationIndex },
      keywords
    );
    expect(searchMock).toHaveBeenCalledTimes(10);
    expect(searchMock.mock.calls[0]?.[0]).toBe(queries[10]);
    expect(second.keywordRotationIndex).toBe(20);

    searchMock.mockClear();
    await runDiscovery({ ...roomy, dailyQueryBudget: 3 }, keywords);
    expect(searchMock).toHaveBeenCalledTimes(3);
  });
});
