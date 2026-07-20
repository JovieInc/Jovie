import { describe, expect, it, vi } from 'vitest';
import { ProfileSearchProviderError } from '@/lib/profile-search/provider';
import {
  type ClaimedProfileSearchQuery,
  type ProfileSearchRunnerDependencies,
  runProfileSearchBatch,
} from '@/lib/profile-search/runner-core';

const query: ClaimedProfileSearchQuery = {
  id: 'query-1',
  request: {
    query: 'Tim White',
    market: 'US',
    locale: 'en',
    device: 'desktop',
    limit: 10,
  },
};

function dependencies(
  overrides: Partial<ProfileSearchRunnerDependencies> = {}
): ProfileSearchRunnerDependencies {
  let claimed = false;
  return {
    provider: {
      id: 'test',
      search: vi.fn().mockResolvedValue({
        provider: 'test',
        fetchedAt: new Date('2026-07-16T00:00:00.000Z'),
        request: query.request,
        organicResults: [
          {
            position: 1,
            title: 'Tim White | Jovie',
            snippet: null,
            url: 'https://jov.ie/tim',
            normalizedUrl: 'https://jov.ie/tim',
          },
        ],
        usage: {},
      }),
    },
    isRolloutEnabled: vi.fn().mockResolvedValue(true),
    isProviderHealthy: vi.fn().mockResolvedValue(true),
    claimDueQuery: vi.fn(async () => {
      if (claimed) return null;
      claimed = true;
      return query;
    }),
    createAttemptIntent: vi.fn().mockResolvedValue('attempt-1'),
    reserveAttemptBudget: vi.fn().mockResolvedValue(true),
    markAttemptIssued: vi.fn().mockResolvedValue(undefined),
    loadSurfaces: vi.fn().mockResolvedValue([
      {
        id: 'surface-1',
        kind: 'jovie',
        normalizedUrl: 'https://jov.ie/tim',
        qualificationStatus: 'qualified',
      },
    ]),
    completeSuccess: vi.fn().mockResolvedValue(undefined),
    completeFailure: vi.fn().mockResolvedValue(undefined),
    markProviderSuccess: vi.fn().mockResolvedValue(undefined),
    markProviderFailure: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('runProfileSearchBatch', () => {
  it('fails closed unless rollout and provider health are enabled', async () => {
    const disabled = dependencies({
      isRolloutEnabled: vi.fn().mockResolvedValue(false),
    });
    expect(
      await runProfileSearchBatch(disabled, {
        deadlineAt: 100_000,
        now: () => 0,
      })
    ).toMatchObject({ enabled: false, claimed: 0 });
    expect(disabled.isProviderHealthy).not.toHaveBeenCalled();

    const unhealthy = dependencies({
      isProviderHealthy: vi.fn().mockResolvedValue(false),
    });
    expect(
      await runProfileSearchBatch(unhealthy, {
        deadlineAt: 100_000,
        now: () => 0,
      })
    ).toMatchObject({ enabled: false, claimed: 0 });
  });

  it('persists intent, reserves budget, marks issued, and stores classified results', async () => {
    const deps = dependencies();
    const stats = await runProfileSearchBatch(deps, {
      deadlineAt: 100_000,
      now: () => 0,
    });

    expect(stats).toMatchObject({
      enabled: true,
      claimed: 1,
      attempted: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(deps.completeSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        results: [expect.objectContaining({ classification: 'owned' })],
      })
    );
  });

  it('does not issue a request when the atomic budget is exhausted', async () => {
    const deps = dependencies({
      reserveAttemptBudget: vi.fn().mockResolvedValue(false),
    });
    const stats = await runProfileSearchBatch(deps, {
      deadlineAt: 100_000,
      now: () => 0,
    });

    expect(stats).toMatchObject({ attempted: 0, skippedBudget: 1 });
    expect(deps.markAttemptIssued).not.toHaveBeenCalled();
    expect(deps.completeFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'budget_exhausted' })
    );
  });

  it('retries transient failures and records provider health', async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(
        new ProfileSearchProviderError('timeout', 'timeout', true)
      )
      .mockResolvedValueOnce({
        provider: 'test',
        fetchedAt: new Date(),
        request: query.request,
        organicResults: [],
        usage: {},
      });
    const deps = dependencies({ provider: { id: 'test', search } });
    const stats = await runProfileSearchBatch(deps, {
      deadlineAt: 100_000,
      now: () => 0,
    });

    expect(stats).toMatchObject({ attempted: 2, retried: 1, succeeded: 1 });
    expect(deps.markProviderFailure).toHaveBeenCalledWith('timeout');
    expect(deps.markProviderSuccess).toHaveBeenCalledOnce();
  });

  it('stops before claiming when less than fifteen seconds remain', async () => {
    const deps = dependencies();
    const stats = await runProfileSearchBatch(deps, {
      deadlineAt: 14_999,
      now: () => 0,
    });
    expect(stats).toMatchObject({ claimed: 0, stoppedForDeadline: true });
    expect(deps.claimDueQuery).not.toHaveBeenCalled();
  });
});
