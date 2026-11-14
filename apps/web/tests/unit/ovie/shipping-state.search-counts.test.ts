import { describe, expect, it, vi } from 'vitest';
import type { LiveIo } from '@/lib/ovie/shipping-state/live';
import {
  readSearchCounts,
  SEARCH_COUNTS_TIMEOUT_MS,
} from '@/lib/ovie/shipping-state/search-counts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function io(fetchImpl: LiveIo['fetch']) {
  return {
    fetch: vi.fn(fetchImpl),
    githubToken: 'hud-token',
    githubOwner: 'JovieInc',
    githubRepo: 'Jovie',
    nowMs: () => Date.parse('2026-11-08T20:00:00.000Z'),
  };
}

function graphqlBody(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body)) as {
    query: string;
    variables: Record<string, unknown>;
  };
}

describe('readSearchCounts', () => {
  it('reads every alias in one GraphQL request', async () => {
    const live = io(async (_url, init) => {
      const { query, variables } = graphqlBody(init);
      expect(query).toContain('q0:search(type:ISSUE,query:$q0,first:1)');
      expect(query).toContain('$q1:String!');
      expect(variables).toEqual({ q0: 'org:JovieInc is:pr', q1: 'repo:x' });
      return json({ data: { q0: { issueCount: 97 }, q1: { issueCount: 0 } } });
    });
    await expect(
      readSearchCounts(live, { q0: 'org:JovieInc is:pr', q1: 'repo:x' })
    ).resolves.toEqual({ status: 'ok', counts: { q0: 97, q1: 0 } });
    expect(live.fetch).toHaveBeenCalledOnce();
  });

  it('gives a full backfill batch the longer search budget', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const queries = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [`q${i}`, 'x'])
    );
    const live = io(async () =>
      json({
        data: Object.fromEntries(
          Object.keys(queries).map(alias => [alias, { issueCount: 1 }])
        ),
      })
    );
    await expect(readSearchCounts(live, queries)).resolves.toMatchObject({
      status: 'ok',
    });
    expect(timeout).toHaveBeenCalledWith(SEARCH_COUNTS_TIMEOUT_MS);
    timeout.mockRestore();
  });

  it('refuses bad aliases before any request', async () => {
    const live = io(async () => json({}));
    for (const queries of [
      {},
      { 'q-0': 'x' },
      Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`q${i}`, 'x'])),
    ]) {
      await expect(readSearchCounts(live, queries)).resolves.toEqual({
        status: 'unavailable',
        reason: 'invalid-search-aliases',
      });
    }
    expect(live.fetch).not.toHaveBeenCalled();
  });

  it('is unavailable on a provider error, a malformed count or a throw', async () => {
    await expect(
      readSearchCounts(
        io(async () => json({}, 502)),
        { q0: 'x' }
      )
    ).resolves.toEqual({ status: 'unavailable', reason: 'github-unavailable' });
    await expect(
      readSearchCounts(
        io(async () => json({ data: { q0: { issueCount: -1 } } })),
        { q0: 'x' }
      )
    ).resolves.toEqual({
      status: 'unavailable',
      reason: 'malformed-search-count',
    });
    await expect(
      readSearchCounts(
        io(async () => {
          throw new Error('boom');
        }),
        { q0: 'x' }
      )
    ).resolves.toEqual({ status: 'unavailable', reason: 'github-unavailable' });
  });
});
