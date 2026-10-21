import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_QUESTIONS,
  renderBench,
  runBench,
  summarizeBench,
} from './bench.ts';
import type { ProviderClients } from './credentials.ts';
import { CapExceeded, callSource, reportedUsd } from './gateway.ts';
import type { Router } from './router.ts';
import { actionable, triageSignals, triggerKind } from './signals.ts';
import { ResearchState } from './state.ts';
import { client, fakeFetch } from './test-fixtures.ts';
import { type Judge, SOURCES } from './types.ts';

function clientsWith(fetch: typeof globalThis.fetch): ProviderClients {
  return {
    exa: () => client('exa', fetch),
    firecrawl: () => client('firecrawl', fetch),
    perplexity: () => null,
    gateway: () => null,
    cloudflare: async () => null,
    hyperagent: () => null,
  };
}

let dir: string;
let state: ResearchState;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'research-ops-'));
  state = new ResearchState(dir);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('callSource', () => {
  it('books provider-reported cost, logs the call and serves repeats from cache', async () => {
    const f = fakeFetch(() => ({
      body: { costDollars: { total: 0.007 }, results: [] },
    }));
    const deps = { state, clients: clientsWith(f.impl) };
    const req = {
      path: '/search',
      body: { query: 'q' },
      caller: 'voc',
      cacheTtlMs: 60_000,
    };
    const first = await callSource(deps, 'exa', req);
    const second = await callSource(deps, 'exa', req);
    expect(first).toMatchObject({ status: 200, usd: 0.007, cached: false });
    expect(second).toMatchObject({ usd: 0, cached: true });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe('https://api.exa.ai/search');
    expect((await state.readUsage()).sources.exa.day).toMatchObject({
      calls: 1,
      usd: 0.007,
    });
    const events = (await state.readMetrics()).filter(
      e => e.event === 'source-call'
    );
    expect(events.map(e => e.cache)).toEqual(['miss', 'hit']);
    expect(events[0].caller).toBe('voc');
  });

  it('refuses over-cap calls before any network and counts credit units', async () => {
    const f = fakeFetch(() => ({ body: { success: true } }));
    const deps = {
      state,
      clients: clientsWith(f.impl),
      config: {
        ...SOURCES,
        sources: {
          ...SOURCES.sources,
          firecrawl: { ...SOURCES.sources.firecrawl, caps: { dailyCalls: 10 } },
        },
      },
    };
    await callSource(deps, 'firecrawl', {
      path: '/v1/batch/scrape',
      body: { urls: [] },
      units: 8,
    });
    await expect(
      callSource(deps, 'firecrawl', {
        path: '/v1/batch/scrape',
        body: { urls: [] },
        units: 8,
      })
    ).rejects.toBeInstanceOf(CapExceeded);
    expect(f.calls).toHaveLength(1);
    expect((await state.readUsage()).sources.firecrawl.day.calls).toBe(8);
  });

  it('fails clearly without a credential and reads only Exa costs', async () => {
    const deps = {
      state,
      clients: {
        ...clientsWith(fakeFetch(() => ({ body: {} })).impl),
        exa: () => null,
      },
    };
    await expect(
      callSource(deps, 'exa', { path: '/search', body: {} })
    ).rejects.toThrow('no credential');
    expect(reportedUsd('exa', { costDollars: { total: 0.01 } })).toBe(0.01);
    expect(
      reportedUsd('firecrawl', { costDollars: { total: 1 } })
    ).toBeUndefined();
  });
});

describe('bench', () => {
  const judge: Judge = {
    name: 'fixed',
    judge: async (_q, hits) => ({
      model: 'fixed',
      scores: hits.map(h => (h.source === 'router-src' ? 3 : 1)),
      answered: 0.5,
      usd: 0,
      ms: 0,
    }),
  };

  it('ships the 20 questions from the 2026-10-20 measurement', () => {
    expect(DEFAULT_QUESTIONS).toHaveLength(20);
  });

  it('runs the router fresh and unpersisted against each baseline, judged by one judge', async () => {
    const f = fakeFetch(() => ({
      body: {
        costDollars: { total: 0.007 },
        results: [{ url: 'https://e', title: 'E', highlights: ['x'] }],
      },
    }));
    const research = vi.fn(async () => ({
      usd: 0.001,
      hits: [
        { source: 'router-src', title: 'R', url: 'https://r', snippet: '' },
      ],
    }));
    const router = {
      research,
      flush: async () => undefined,
    } as unknown as Router;
    const { rows, summary } = await runBench(
      { router, state, clients: clientsWith(f.impl), judge },
      {
        questions: [{ query: 'a' }, { query: 'b' }],
        baselines: ['exa', 'nope'],
        label: 't',
      }
    );
    expect(research).toHaveBeenCalledWith(
      expect.objectContaining({
        refresh: true,
        persist: false,
        caller: 'bench:t',
      })
    );
    expect(rows[0].arms.map(a => a.arm)).toEqual(['router', 'exa', 'nope']);
    const byArm = Object.fromEntries(summary.map(s => [s.arm, s]));
    expect(byArm.router.top5).toBe(3);
    expect(byArm.exa).toMatchObject({ usd: 0.014, top5: 1, winsVsRouter: 0 });
    expect(byArm.nope.errors).toBe(2);
    expect(renderBench('t', summary, 2)).toContain('exa | 0.0140');
  });

  it('summarizes medians and wins', () => {
    const arm = (a: string, top5: number, ms: number) => ({
      arm: a,
      usd: 0,
      ms,
      score: { top5, good: 0, answered: 0 },
    });
    const s = summarizeBench([
      { query: 'x', arms: [arm('router', 1, 10), arm('exa', 2, 1)] },
      { query: 'y', arms: [arm('router', 2, 30), arm('exa', 2, 3)] },
    ]);
    expect(s.find(x => x.arm === 'exa')).toMatchObject({
      winsVsRouter: 1,
      medianMs: 1,
    });
  });
});

describe('signal triage', () => {
  const page = (
    verdict: string,
    surface: string,
    score: number,
    category = 'platform'
  ) =>
    `---\ntype: "signal"\n---\n` +
    JSON.stringify({ verdict, surface, score, category });

  it('selects adopt/buy/borrow/clone for internal ops above the score floor', () => {
    expect(
      actionable({
        slug: 's',
        title: 't',
        verdict: 'adopt',
        surface: 'internal-ops',
        score: 0.7,
        updatedAt: '',
      })
    ).toBe(true);
    expect(
      actionable({
        slug: 's',
        title: 't',
        verdict: 'ignore',
        surface: 'internal-ops',
        score: 0.9,
        updatedAt: '',
      })
    ).toBe(false);
    expect(
      actionable({
        slug: 's',
        title: 't',
        verdict: 'adopt',
        surface: 'product',
        score: 0.9,
        updatedAt: '',
      })
    ).toBe(false);
    expect(
      actionable({
        slug: 's',
        title: 't',
        verdict: 'adopt',
        surface: 'both',
        score: 0.5,
        updatedAt: '',
      })
    ).toBe(false);
    expect([
      triggerKind('ai-lab'),
      triggerKind('competitor'),
      triggerKind('platform'),
    ]).toEqual(['model', 'data', 'tool']);
    expect(page('a', 'b', 1)).toContain('verdict');
  });

  it('opens one review per actionable signal, once, and advances the cursor', async () => {
    const calls: { tool: string; args: Record<string, unknown> }[] = [];
    const fm: Record<string, Record<string, unknown>> = {
      'signals/changelog/cloudflare-changelog/1': {
        verdict: 'adopt',
        surface: 'internal-ops',
        score: 0.8,
        category: 'platform',
        url: 'https://cf/1',
      },
      'signals/changelog/linktree-blog/2': {
        verdict: 'clone',
        surface: 'product',
        score: 0.9,
        category: 'competitor',
      },
    };
    const gbrain = {
      async call<T>(tool: string, args: Record<string, unknown>): Promise<T> {
        calls.push({ tool, args });
        if (tool === 'list_pages')
          return (
            args.updated_after
              ? []
              : Object.keys(fm).map((slug, i) => ({
                  slug,
                  title: `T${i}`,
                  updated_at: `2026-10-20T0${i}:00:00Z`,
                }))
          ) as T;
        if (tool === 'get_page')
          return { slug: args.slug, frontmatter: fm[String(args.slug)] } as T;
        if (tool === 'search')
          return [
            {
              slug: 'decisions/research/router',
              title: 'Router',
              type: 'decision',
              score: 0.9,
            },
          ] as T;
        return {} as T;
      },
    };
    const first = await triageSignals({ gbrain, state });
    expect(first).toMatchObject({
      scanned: 2,
      actionable: 1,
      cursor: '2026-10-20T01:00:00Z',
    });
    expect(first.reviews).toEqual([
      {
        signal: 'signals/changelog/cloudflare-changelog/1',
        decision: 'decisions/research/router',
        review: expect.stringContaining('decisions/reviews/'),
      },
    ]);
    const second = await triageSignals({ gbrain, state });
    expect(second.scanned).toBe(0);
    expect(
      calls.filter(c => c.tool === 'list_pages').at(-1)?.args.updated_after
    ).toBe('2026-10-20T01:00:00Z');
    const again = await triageSignals(
      { gbrain, state },
      { since: '2026-01-01' }
    );
    expect(again.reviews).toEqual([]); // already-seen signal does not reopen a review
  });
});
