import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  captureErrorMock,
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
} = vi.hoisted(() => {
  const searchGoogleCSEMock = vi.fn();
  const captureErrorMock = vi.fn();
  const isLinktreeUrlMock = vi.fn();
  const extractLinktreeHandleMock = vi.fn();

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

  const whereMock = vi.fn();
  const setMock = vi.fn(() => ({ where: whereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));

  return {
    extractLinktreeHandleMock,
    isLinktreeUrlMock,
    searchGoogleCSEMock,
    captureErrorMock,
    returningMock,
    onConflictDoNothingMock,
    valuesMock,
    insertMock,
    whereMock,
    setMock,
    updateMock,
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

vi.mock('@/lib/db', () => ({
  db: {
    insert: insertMock,
    update: updateMock,
  },
}));

describe('runDiscovery', () => {
  beforeEach(() => {
    searchGoogleCSEMock.mockReset();
    captureErrorMock.mockReset();
    isLinktreeUrlMock.mockReset();
    extractLinktreeHandleMock.mockReset();
    insertMock.mockClear();
    valuesMock.mockClear();
    onConflictDoNothingMock.mockClear();
    returningMock.mockReset();
    updateMock.mockClear();
    setMock.mockClear();
    whereMock.mockReset();
    whereMock.mockResolvedValue(undefined);
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

    const result = await runDiscovery(
      {
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
        dmOpenerTemplate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      [
        {
          id: 'keyword-1',
          query: 'indie pop artist linktree',
          enabled: true,
          lastUsedAt: null,
          resultsFoundTotal: 0,
          createdAt: new Date(),
        },
      ]
    );

    expect(result.queriesUsed).toBe(1);
    expect(result.candidatesProcessed).toBe(2);
    expect(result.newLeadsFound).toBe(1);
    expect(result.duplicatesSkipped).toBe(1);

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
  });

  it('skips inserts when no valid linktree candidates are found', async () => {
    const { runDiscovery } = await import('@/lib/leads/discovery');

    isLinktreeUrlMock.mockReturnValue(false);
    extractLinktreeHandleMock.mockReturnValue(null);

    searchGoogleCSEMock.mockResolvedValue([
      { link: 'https://example.com/a' },
      { link: 'https://example.com/b' },
    ]);

    const result = await runDiscovery(
      {
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
        dmOpenerTemplate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      [
        {
          id: 'keyword-1',
          query: 'music producer linktree',
          enabled: true,
          lastUsedAt: null,
          resultsFoundTotal: 0,
          createdAt: new Date(),
        },
      ]
    );

    expect(result.candidatesProcessed).toBe(0);
    expect(result.newLeadsFound).toBe(0);
    expect(result.duplicatesSkipped).toBe(0);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
