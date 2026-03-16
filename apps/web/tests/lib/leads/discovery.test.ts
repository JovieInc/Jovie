import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  captureErrorMock,
  executeMock,
  insertMock,
  onConflictDoNothingMock,
  returningMock,
  extractLinktreeHandleMock,
  isLinktreeUrlMock,
  searchGoogleCSEMock,
  setMock,
  updateMock,
  valuesMock,
  whereMock,
  pipelineLogMock,
  pipelineWarnMock,
} = vi.hoisted(() => {
  const searchGoogleCSEMock = vi.fn();
  const captureErrorMock = vi.fn();
  const isLinktreeUrlMock = vi.fn();
  const extractLinktreeHandleMock = vi.fn();
  const pipelineLogMock = vi.fn();
  const pipelineWarnMock = vi.fn();

  const returningMock = vi.fn();
  const onConflictDoNothingMock = vi.fn(() => ({
    returning: returningMock,
  }));
  const valuesMock = vi.fn(() => ({
    onConflictDoNothing: onConflictDoNothingMock,
  }));
  const insertMock = vi.fn(() => ({
    values: valuesMock,
  }));
  const executeMock = vi.fn();

  const whereMock = vi.fn();
  const setMock = vi.fn(() => ({ where: whereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));

  return {
    extractLinktreeHandleMock,
    isLinktreeUrlMock,
    searchGoogleCSEMock,
    captureErrorMock,
    executeMock,
    returningMock,
    onConflictDoNothingMock,
    valuesMock,
    insertMock,
    whereMock,
    setMock,
    updateMock,
    pipelineLogMock,
    pipelineWarnMock,
  };
});

vi.mock('@/lib/leads/google-cse', () => ({
  searchGoogleCSE: searchGoogleCSEMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: captureErrorMock,
}));

vi.mock('@/lib/ingestion/strategies/linktree', () => ({
  extractLinktreeHandle: extractLinktreeHandleMock,
  isLinktreeUrl: isLinktreeUrlMock,
}));

vi.mock('@/lib/leads/pipeline-logger', () => ({
  pipelineLog: pipelineLogMock,
  pipelineWarn: pipelineWarnMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    execute: executeMock,
    insert: insertMock,
    update: updateMock,
  },
}));

const defaultSettings = {
  id: 1,
  enabled: true,
  discoveryEnabled: true,
  autoIngestEnabled: false,
  autoIngestMinFitScore: 60,
  autoIngestDailyLimit: 10,
  autoIngestedToday: 0,
  autoIngestResetsAt: null,
  dailyQueryBudget: 1,
  queriesUsedToday: 0,
  queryBudgetResetsAt: null,
  lastDiscoveryQueryIndex: 0,
  dmTemplate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const defaultKeyword = {
  id: 'keyword-1',
  query: 'indie pop artist linktree',
  enabled: true,
  lastUsedAt: null,
  resultsFoundTotal: 0,
  searchOffset: 1,
  createdAt: new Date(),
};

describe('runDiscovery', () => {
  beforeEach(() => {
    searchGoogleCSEMock.mockReset();
    captureErrorMock.mockReset();
    isLinktreeUrlMock.mockReset();
    extractLinktreeHandleMock.mockReset();
    insertMock.mockClear();
    executeMock.mockReset();
    valuesMock.mockClear();
    onConflictDoNothingMock.mockClear();
    returningMock.mockReset();
    updateMock.mockClear();
    setMock.mockClear();
    whereMock.mockReset();
    whereMock.mockResolvedValue(undefined);
    pipelineLogMock.mockReset();
    pipelineWarnMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('batches candidate inserts and tracks inserted vs deduped counts', async () => {
    isLinktreeUrlMock.mockImplementation((url: string) =>
      url.includes('linktr.ee')
    );
    extractLinktreeHandleMock.mockImplementation(
      (url: string) => url.split('/').at(-1) ?? null
    );

    searchGoogleCSEMock.mockResolvedValue([
      { link: 'https://linktr.ee/artist-one' },
      { link: 'https://linktr.ee/artist-one' },
      { link: 'https://linktr.ee/artist-two' },
      { link: 'https://example.com/not-linktree' },
    ]);

    returningMock.mockResolvedValue([{ id: 'lead-1' }]);

    const { runDiscovery } = await import('@/lib/leads/discovery');

    const result = await runDiscovery(defaultSettings, [defaultKeyword]);

    expect(result.queriesUsed).toBe(1);
    expect(result.candidatesProcessed).toBe(2);
    expect(result.newLeadsFound).toBe(1);
    expect(result.duplicatesSkipped).toBe(1);
    expect(result.totalEnabledKeywords).toBe(1);

    // Verify diagnostics
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      keywordId: 'keyword-1',
      rawResultCount: 4,
      linktreeUrlsFound: 2,
      newLeadsInserted: 1,
      duplicatesSkipped: 1,
      error: null,
      searchOffset: 1,
    });
    expect(result.diagnostics[0]!.durationMs).toBeGreaterThanOrEqual(0);

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledTimes(1);

    const firstInsertCall = valuesMock.mock.calls.at(0) as
      | [Array<{ linktreeHandle: string }>]
      | undefined;

    expect(firstInsertCall).toBeDefined();

    const submittedCandidates = firstInsertCall?.[0] ?? [];

    expect(submittedCandidates).toHaveLength(2);
    expect(
      submittedCandidates.map(candidate => candidate.linktreeHandle)
    ).toEqual(['artist-one', 'artist-two']);

    expect(onConflictDoNothingMock).toHaveBeenCalledTimes(1);
    expect(returningMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).not.toHaveBeenCalled();
  }, 10_000);

  it('skips inserts when no valid linktree candidates are found', async () => {
    const { runDiscovery } = await import('@/lib/leads/discovery');

    isLinktreeUrlMock.mockReturnValue(false);
    extractLinktreeHandleMock.mockReturnValue(null);

    searchGoogleCSEMock.mockResolvedValue([
      { link: 'https://example.com/a' },
      { link: 'https://example.com/b' },
    ]);

    const result = await runDiscovery(defaultSettings, [defaultKeyword]);

    expect(result.candidatesProcessed).toBe(0);
    expect(result.newLeadsFound).toBe(0);
    expect(result.duplicatesSkipped).toBe(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      rawResultCount: 2,
      linktreeUrlsFound: 0,
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('falls back to legacy raw insert when leads schema has missing columns', async () => {
    isLinktreeUrlMock.mockImplementation((url: string) =>
      url.includes('linktr.ee')
    );
    extractLinktreeHandleMock.mockImplementation(
      (url: string) => url.split('/').at(-1) ?? null
    );

    searchGoogleCSEMock.mockResolvedValue([
      { link: 'https://linktr.ee/artist-three' },
      { link: 'https://linktr.ee/artist-four' },
    ]);

    returningMock.mockRejectedValueOnce(
      new Error('column "has_instagram" of relation "leads" does not exist')
    );

    executeMock
      .mockResolvedValueOnce({ rows: [{ id: 'lead-3' }] })
      .mockResolvedValueOnce({ rows: [] });

    const { runDiscovery } = await import('@/lib/leads/discovery');

    const result = await runDiscovery(defaultSettings, [defaultKeyword]);

    expect(result.candidatesProcessed).toBe(2);
    expect(result.newLeadsFound).toBe(1);
    expect(result.duplicatesSkipped).toBe(1);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      newLeadsInserted: 1,
      duplicatesSkipped: 1,
    });
    expect(executeMock).toHaveBeenCalledTimes(2);
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it('passes searchOffset to Google CSE for pagination', async () => {
    isLinktreeUrlMock.mockReturnValue(false);
    searchGoogleCSEMock.mockResolvedValue([]);

    const { runDiscovery } = await import('@/lib/leads/discovery');

    const result = await runDiscovery(defaultSettings, [
      { ...defaultKeyword, searchOffset: 21 },
    ]);

    expect(searchGoogleCSEMock).toHaveBeenCalledWith(defaultKeyword.query, 21);
    expect(result.diagnostics[0]?.searchOffset).toBe(21);
  });

  it('resets searchOffset to 1 when results are less than 10', async () => {
    isLinktreeUrlMock.mockReturnValue(false);
    searchGoogleCSEMock.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        link: `https://example.com/${i}`,
      }))
    );

    const { runDiscovery } = await import('@/lib/leads/discovery');

    await runDiscovery(defaultSettings, [
      { ...defaultKeyword, searchOffset: 31 },
    ]);

    // The update call should set searchOffset to 1 (reset)
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ searchOffset: 1 })
    );
  });

  it('warns when budget is exhausted', async () => {
    const { runDiscovery } = await import('@/lib/leads/discovery');

    const result = await runDiscovery(
      { ...defaultSettings, dailyQueryBudget: 100, queriesUsedToday: 100 },
      [defaultKeyword]
    );

    expect(result.queriesUsed).toBe(0);
    expect(result.budgetRemaining).toBe(0);
    expect(pipelineWarnMock).toHaveBeenCalledWith(
      'discovery',
      'Daily query budget exhausted',
      expect.objectContaining({ budget: 100, used: 100 })
    );
  });

  it('warns when no keywords are configured', async () => {
    const { runDiscovery } = await import('@/lib/leads/discovery');

    const result = await runDiscovery(defaultSettings, []);

    expect(result.queriesUsed).toBe(0);
    expect(pipelineWarnMock).toHaveBeenCalledWith(
      'discovery',
      'No keywords configured — skipping discovery'
    );
  });

  it('captures errors per keyword and includes them in diagnostics', async () => {
    searchGoogleCSEMock.mockRejectedValue(new Error('Network error'));

    const { runDiscovery } = await import('@/lib/leads/discovery');

    const result = await runDiscovery(defaultSettings, [defaultKeyword]);

    expect(result.queriesUsed).toBe(1);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      error: 'Network error',
      rawResultCount: 0,
    });
    expect(captureErrorMock).toHaveBeenCalledWith(
      'Discovery query failed',
      expect.any(Error),
      expect.objectContaining({
        route: 'leads/discovery',
      })
    );
  });
});
