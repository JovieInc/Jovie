import { describe, expect, it } from 'vitest';
import {
  fetchOpenPrsRest,
  normalizeRestPullRequest,
} from '../github-open-prs-rest.mjs';

function detail(number, sha = `sha-${number}`) {
  return {
    number,
    title: `PR ${number}`,
    html_url: `https://github.test/pull/${number}`,
    user: { login: 'agent' },
    created_at: '2026-07-12T00:00:00Z',
    updated_at: '2026-07-12T01:00:00Z',
    draft: false,
    mergeable: true,
    mergeable_state: 'behind',
    base: { ref: 'main', repo: { full_name: 'JovieInc/Jovie' } },
    head: {
      ref: `codex/pr-${number}`,
      sha,
      repo: {
        name: 'Jovie',
        full_name: 'JovieInc/Jovie',
        owner: { login: 'JovieInc' },
      },
    },
    labels: [{ name: 'gated' }],
    changed_files: 2,
    additions: 10,
    deletions: 3,
    maintainer_can_modify: true,
  };
}

describe('REST open PR inventory', () => {
  it('paginates without GraphQL and hydrates exact-head checks', async () => {
    const calls = [];
    const request = async endpoint => {
      calls.push(endpoint);
      if (endpoint.includes('/pulls?')) {
        return endpoint.includes('page=1')
          ? Array.from({ length: 100 }, (_, index) => ({ number: index + 1 }))
          : [{ number: 101 }];
      }
      const number = Number(endpoint.match(/pulls\/(\d+)/)?.[1]);
      if (number) return detail(number);
      if (endpoint.includes('/check-runs')) {
        return {
          total_count: 1,
          check_runs: [
            {
              name: 'PR Ready',
              status: 'completed',
              conclusion: 'success',
              started_at: '2026-07-12T00:00:00Z',
              completed_at: '2026-07-12T00:01:00Z',
            },
          ],
        };
      }
      if (endpoint.includes('/status?')) {
        return {
          total_count: 1,
          statuses: [
            {
              context: 'Fork PR Gate',
              state: 'success',
              created_at: '2026-07-12T00:01:00Z',
            },
          ],
        };
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    };

    const prs = await fetchOpenPrsRest({
      repo: 'JovieInc/Jovie',
      limit: 101,
      request,
    });

    expect(prs).toHaveLength(101);
    expect(calls.filter(call => call.includes('/pulls?'))).toHaveLength(2);
    expect(calls.some(call => call.includes('graphql'))).toBe(false);
    expect(prs[0].statusCheckRollup).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'PR Ready', conclusion: 'SUCCESS' }),
        expect.objectContaining({ context: 'Fork PR Gate', state: 'SUCCESS' }),
      ])
    );
  });

  it('fails closed when exact-head check hydration is incomplete', async () => {
    const request = async endpoint => {
      if (endpoint.includes('/pulls?')) return [{ number: 7 }];
      if (endpoint.endsWith('/pulls/7')) return detail(7);
      if (endpoint.includes('/check-runs')) {
        return { total_count: 0, check_runs: [] };
      }
      if (endpoint.includes('/status')) return {};
      throw new Error(`unexpected endpoint ${endpoint}`);
    };

    await expect(
      fetchOpenPrsRest({ repo: 'JovieInc/Jovie', request })
    ).rejects.toThrow('REST statuses for PR #7 were incomplete');
  });

  it('paginates check runs until total_count is satisfied', async () => {
    const calls = [];
    const request = async endpoint => {
      calls.push(endpoint);
      if (endpoint.includes('/pulls?')) return [{ number: 8 }];
      if (endpoint.endsWith('/pulls/8')) return detail(8);
      if (endpoint.includes('/check-runs')) {
        const page = endpoint.endsWith('page=2') ? 2 : 1;
        return {
          total_count: 101,
          check_runs: Array.from({ length: page === 1 ? 100 : 1 }, () => ({
            name: 'Unit Tests',
            status: 'completed',
            conclusion: 'success',
          })),
        };
      }
      if (endpoint.includes('/status?')) {
        return { total_count: 0, statuses: [] };
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    };

    const [pr] = await fetchOpenPrsRest({
      repo: 'JovieInc/Jovie',
      limit: 1,
      request,
    });

    expect(pr.statusCheckRollup).toHaveLength(101);
    expect(calls.filter(call => call.includes('/check-runs'))).toHaveLength(2);
  });

  it('fails closed when check-run total_count is missing', async () => {
    const request = async endpoint => {
      if (endpoint.includes('/pulls?')) return [{ number: 12 }];
      if (endpoint.endsWith('/pulls/12')) return detail(12);
      if (endpoint.includes('/check-runs')) return { check_runs: [] };
      throw new Error(`unexpected endpoint ${endpoint}`);
    };

    await expect(
      fetchOpenPrsRest({ repo: 'JovieInc/Jovie', limit: 1, request })
    ).rejects.toThrow('REST checks for PR #12 were incomplete');
  });

  it('fails closed when check-run total_count changes between pages', async () => {
    const request = async endpoint => {
      if (endpoint.includes('/pulls?')) return [{ number: 13 }];
      if (endpoint.endsWith('/pulls/13')) return detail(13);
      if (endpoint.includes('/check-runs')) {
        const page = endpoint.endsWith('page=2') ? 2 : 1;
        return {
          total_count: page === 1 ? 101 : 102,
          check_runs: Array.from({ length: page === 1 ? 100 : 1 }, () => ({
            name: 'Unit Tests',
            status: 'completed',
            conclusion: 'success',
          })),
        };
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    };

    await expect(
      fetchOpenPrsRest({ repo: 'JovieInc/Jovie', limit: 1, request })
    ).rejects.toThrow('REST checks for PR #13 were incomplete');
  });

  it('paginates status contexts until total_count is satisfied', async () => {
    const calls = [];
    const request = async endpoint => {
      calls.push(endpoint);
      if (endpoint.includes('/pulls?')) return [{ number: 10 }];
      if (endpoint.endsWith('/pulls/10')) return detail(10);
      if (endpoint.includes('/check-runs')) {
        return { total_count: 0, check_runs: [] };
      }
      if (endpoint.includes('/status?')) {
        const page = endpoint.endsWith('page=2') ? 2 : 1;
        return {
          total_count: 101,
          statuses: Array.from({ length: page === 1 ? 100 : 1 }, () => ({
            context: 'Repeated Context',
            state: 'success',
          })),
        };
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    };

    const [pr] = await fetchOpenPrsRest({
      repo: 'JovieInc/Jovie',
      limit: 1,
      request,
    });

    expect(pr.statusCheckRollup).toHaveLength(101);
    expect(calls.filter(call => call.includes('/status?'))).toHaveLength(2);
  });

  it('fails closed when status total_count is missing', async () => {
    const request = async endpoint => {
      if (endpoint.includes('/pulls?')) return [{ number: 11 }];
      if (endpoint.endsWith('/pulls/11')) return detail(11);
      if (endpoint.includes('/check-runs')) {
        return { total_count: 0, check_runs: [] };
      }
      if (endpoint.includes('/status?')) return { statuses: [] };
      throw new Error(`unexpected endpoint ${endpoint}`);
    };

    await expect(
      fetchOpenPrsRest({ repo: 'JovieInc/Jovie', limit: 1, request })
    ).rejects.toThrow('REST statuses for PR #11 were incomplete');
  });

  it('normalizes REST mergeability and repository ownership fields', () => {
    const normalized = normalizeRestPullRequest(detail(9), []);
    expect(normalized).toMatchObject({
      number: 9,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'BEHIND',
      headRefName: 'codex/pr-9',
      headRepositoryOwner: { login: 'JovieInc' },
      isCrossRepository: false,
      changedFiles: 2,
    });
  });
});
