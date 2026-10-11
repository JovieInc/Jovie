import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  LINEAR_API_KEY: 'lin_test' as string | undefined,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env-server', () => ({ env }));
vi.mock('@/lib/utils/logger', () => ({ logger: { warn: vi.fn() } }));

import {
  COHORT_LEARNING_LABEL,
  countOpenCohortLearnings,
} from '@/lib/waitlist/cohort-learnings';

const fetchMock = vi.fn();

function linearResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

describe('countOpenCohortLearnings', () => {
  beforeEach(() => {
    env.LINEAR_API_KEY = 'lin_test';
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('counts open issues carrying the cohort-learning label', async () => {
    fetchMock.mockResolvedValue(
      linearResponse({
        data: { issues: { nodes: [{ id: 'a' }, { id: 'b' }] } },
      })
    );

    await expect(countOpenCohortLearnings()).resolves.toBe(2);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.variables.label).toBe(COHORT_LEARNING_LABEL);
  });

  it('returns null without an API key and never calls Linear', async () => {
    env.LINEAR_API_KEY = undefined;

    await expect(countOpenCohortLearnings()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['an HTTP error', linearResponse({}, false)],
    ['GraphQL errors', linearResponse({ errors: [{ message: 'bad' }] })],
    ['a missing issues list', linearResponse({ data: {} })],
  ])('returns null on %s', async (_label, response) => {
    fetchMock.mockResolvedValue(response);

    await expect(countOpenCohortLearnings()).resolves.toBeNull();
  });

  it('returns null when the request throws', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));

    await expect(countOpenCohortLearnings()).resolves.toBeNull();
  });
});
