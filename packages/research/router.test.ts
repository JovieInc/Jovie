import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyVerdict,
  createRouter,
  plan,
  type SourceImpl,
  topHits,
} from './router.ts';
import { ResearchState } from './state.ts';
import { sampleResult } from './test-fixtures.ts';
import type { Hit, Judge } from './types.ts';

const hit = (source: string, title: string): Hit => ({
  source,
  title,
  url: `https://${source}/${title}`,
  snippet: title,
});

function source(hits: Hit[], extra: Partial<SourceImpl> = {}) {
  const run = vi.fn(async () => ({
    hits,
    usd: undefined as number | undefined,
  }));
  return { run, available: () => true, ...extra } as SourceImpl & {
    run: typeof run;
  };
}

/** Scores by title: "good*" → 3, "meh*" → 1.6, everything else junk. */
const titleJudge = (
  name = 'clef-flash'
): Judge & { judge: ReturnType<typeof vi.fn> } => ({
  name,
  judge: vi.fn(async (_q: string, hits: readonly Hit[]) => ({
    model: name,
    scores: hits.map(h =>
      h.title.startsWith('good') ? 3 : h.title.startsWith('meh') ? 1.6 : 0
    ),
    answered: hits.some(h => h.title.startsWith('good')) ? 0.9 : 0.1,
    usd: 0.00001,
    ms: 1,
  })),
});

describe('plan', () => {
  it('orders local, credits/free, then paid; deep and social add sources', () => {
    expect(plan({ mode: 'standard', social: false }, [])).toEqual([
      ['gbrain', 'repo'],
      ['firecrawl'],
      ['exa'],
    ]);
    expect(plan({ mode: 'deep', social: true }, ['https://x'])).toEqual([
      ['gbrain', 'repo'],
      ['cloudflare-fetch', 'firecrawl', 'last30days', 'hyperagent'],
      ['exa', 'perplexity'],
    ]);
  });
});

describe('router', () => {
  let dir: string;
  let state: ResearchState;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'research-router-'));
    state = new ResearchState(dir);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('stops at the local tier when the judge finds enough good evidence', async () => {
    const sources = {
      gbrain: source([hit('gbrain', 'good-1'), hit('gbrain', 'good-2')]),
      repo: source([hit('repo', 'good-3'), hit('repo', 'junk')]),
      firecrawl: source([]),
      exa: source([]),
    };
    const persist = vi.fn(async () => 'research/q-x');
    const router = createRouter({
      state,
      sources,
      judges: [titleJudge()],
      persist,
    });
    const result = await router.research({
      query: 'q local',
      mode: 'standard',
    });
    expect(result.stoppedAtTier).toBe(0);
    expect(result.hits.map(h => h.title)).toEqual([
      'good-1',
      'good-2',
      'good-3',
    ]);
    expect(result.dropped).toBe(1);
    expect(sources.firecrawl.run).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled(); // local answers are not re-stored
  });

  it('escalates past junk to paid search, persists, then serves the cache', async () => {
    const sources = {
      gbrain: source([hit('gbrain', 'junk')]),
      repo: source([]),
      firecrawl: source([hit('firecrawl', 'meh')]),
      exa: source([
        hit('exa', 'good-a'),
        hit('exa', 'good-b'),
        hit('exa', 'good-c'),
      ]),
    };
    sources.exa.run.mockResolvedValueOnce({
      hits: [hit('exa', 'good-a'), hit('exa', 'good-b'), hit('exa', 'good-c')],
      usd: 0.007,
    });
    const persist = vi.fn(async () => 'research/q-x');
    const prior = vi.fn(async () => [{ slug: 'decisions/a', title: 'A' }]);
    const router = createRouter({
      state,
      sources,
      judges: [titleJudge()],
      persist,
      prior,
    });
    const first = await router.research({ query: 'q web', caller: 'test' });
    expect(first.stoppedAtTier).toBe(2);
    expect(first.hits[0].title).toBe('good-a');
    expect(first.usd).toBeCloseTo(0.007 + 3 * 0.00001);
    expect(first.gbrainSlug).toBe('research/q-x');
    expect(first.priorDecisions).toEqual([{ slug: 'decisions/a', title: 'A' }]);
    const second = await router.research({ query: 'Q  web?', caller: 'test' });
    expect(second.cache).toBe('local');
    expect(sources.exa.run).toHaveBeenCalledTimes(1);
    const metrics = await state.readMetrics();
    expect(metrics.map(m => m.cache)).toEqual(['miss', 'local']);
    expect(metrics[1].usd).toBe(0);
  });

  it('honors localOnly and maxTier', async () => {
    const sources = {
      gbrain: source([]),
      repo: source([]),
      firecrawl: source([hit('f', 'good')]),
      exa: source([]),
    };
    const router = createRouter({ state, sources, judges: [] });
    expect(
      (await router.research({ query: 'a', localOnly: true })).stoppedAtTier
    ).toBe(0);
    expect(
      (await router.research({ query: 'b', maxTier: 1 })).stoppedAtTier
    ).toBe(1);
    expect(sources.exa.run).not.toHaveBeenCalled();
  });

  it('skips sources over their cap or without a credential, without failing', async () => {
    const sources = {
      gbrain: source([]),
      repo: source([]),
      firecrawl: source([], { available: () => false }),
      exa: source([hit('exa', 'good')]),
    };
    const config = (await import('./types.ts')).SOURCES;
    const capped = {
      ...config,
      sources: {
        ...config.sources,
        exa: { ...config.sources.exa, caps: { dailyCalls: 0 } },
      },
    };
    const router = createRouter({ state, sources, judges: [], config: capped });
    const result = await router.research({ query: 'capped' });
    expect(result.runs.find(r => r.source === 'firecrawl')?.skipped).toBe(
      'no credential'
    );
    expect(result.runs.find(r => r.source === 'exa')?.skipped).toBe(
      'cap dailyCalls 0'
    );
    expect(sources.exa.run).not.toHaveBeenCalled();
    expect(result.hits).toEqual([]);
  });

  it('records source errors and falls back to the next judge', async () => {
    const broken: Judge = {
      name: 'clef-flash',
      judge: async () => Promise.reject(new Error('422')),
    };
    const backup = titleJudge('jev');
    const sources = {
      gbrain: source([], {
        run: async () =>
          Promise.reject(new Error('gbrain-unavailable: timeout')),
      }),
      repo: source([
        hit('repo', 'good-1'),
        hit('repo', 'good-2'),
        hit('repo', 'good-3'),
      ]),
      firecrawl: source([]),
      exa: source([]),
    };
    const router = createRouter({ state, sources, judges: [broken, backup] });
    const result = await router.research({ query: 'fallback' });
    expect(result.judge.model).toBe('jev');
    expect(result.runs.find(r => r.source === 'gbrain')?.error).toContain(
      'gbrain-unavailable'
    );
    expect(result.runs.find(r => r.source === 'clef-flash')?.error).toBe('422');
    expect(result.stoppedAtTier).toBe(0);
  });

  it('marks all unavailable providers degraded and retries after recovery', async () => {
    const sources = {
      gbrain: source([]),
      repo: source([]),
      firecrawl: source([], { available: () => false }),
      exa: source([], { available: () => false }),
      last30days: source([], { available: () => false }),
    };
    const router = createRouter({ state, sources, judges: [] });
    const result = await router.research({
      query: 'provider outage',
      social: true,
    });
    expect(result.verdict).toBe('degraded');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'no external sources',
        'firecrawl: no credential',
        'exa: no credential',
        'last30days: no credential',
      ])
    );
    sources.firecrawl.available = () => true;
    sources.firecrawl.run.mockResolvedValue({
      hits: [hit('firecrawl', 'good')],
      usd: 0,
    });
    const recovered = await createRouter({
      state,
      sources,
      judges: [titleJudge()],
    }).research({ query: 'provider outage', maxTier: 1 });
    expect(recovered.verdict).toBe('ok');
  });

  it('keeps healthy external research green (negative control)', async () => {
    const router = createRouter({
      state,
      judges: [titleJudge()],
      sources: {
        gbrain: source([]),
        repo: source([]),
        firecrawl: source([hit('firecrawl', 'good')]),
      },
    });
    const result = await router.research({ query: 'healthy' });
    expect(result.verdict).toBe('ok');
    expect(result.reasons).toEqual([]);
  });

  it('does not promote local evidence to external research at max-tier 0', async () => {
    const router = createRouter({
      state,
      judges: [titleJudge()],
      sources: {
        gbrain: source([hit('gbrain', 'good')]),
        repo: source([]),
      },
    });
    const result = await router.research({
      query: 'local only',
      maxTier: 0,
      social: true,
    });
    expect(result.verdict).toBe('degraded');
    expect(result.reasons).toContain('no external sources');
    expect(result.reasons).toContain('external providers not run');
  });

  it('rejects legacy cached empty answers and records unavailable checks as degraded', async () => {
    const legacy = sampleResult({ hits: [], answer: 'Unsupported answer' });
    const router = createRouter({
      state,
      judges: [],
      loadPersisted: async () => legacy,
      sources: {
        firecrawl: source([], {
          available: async () => {
            throw new Error('availability failed');
          },
        }),
      },
    });
    const result = await router.research({ query: 'legacy empty answer' });
    expect(result.verdict).toBe('degraded');
    expect(result.reasons).toContain('firecrawl: availability failed');
  });

  it('coalesces concurrent identical queries into one execution', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => {
      release = r;
    });
    const firecrawl = source([
      hit('f', 'good-1'),
      hit('f', 'good-2'),
      hit('f', 'good-3'),
    ]);
    firecrawl.run.mockImplementation(async () => {
      await gate;
      return {
        hits: [hit('f', 'good-1'), hit('f', 'good-2'), hit('f', 'good-3')],
        usd: 0,
      };
    });
    const sources = {
      gbrain: source([]),
      repo: source([]),
      firecrawl,
      exa: source([]),
    };
    const router = createRouter({ state, sources, judges: [titleJudge()] });
    const a = router.research({ query: 'same thing' });
    const b = router.research({ query: 'thing same' });
    await new Promise(r => setTimeout(r, 20));
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(firecrawl.run).toHaveBeenCalledTimes(1);
    expect([ra.cache, rb.cache].sort()).toEqual(['inflight', 'miss']);
  });

  it('reuses a persisted gbrain result and warms the local cache', async () => {
    const loadPersisted = vi.fn(async () =>
      sampleResult({ key: 'from-gbrain' })
    );
    const sources = { gbrain: source([]), repo: source([]) };
    const router = createRouter({ state, sources, judges: [], loadPersisted });
    const result = await router.research({
      query: 'exa pricing',
      freshness: 'month',
    });
    expect(result.cache).toBe('gbrain');
    expect(await state.getCached('from-gbrain')).not.toBeNull();
    expect(sources.gbrain.run).not.toHaveBeenCalled();
  });
});

describe('applyVerdict', () => {
  it('keeps local evidence at a lower bar than web hits', () => {
    const h = (source: string) => ({
      source,
      title: source,
      url: `https://${source}`,
      snippet: '',
    });
    const { kept } = applyVerdict(
      [h('repo'), h('exa'), h('gbrain')],
      [1.2, 1.2, 0.5],
      1.5
    );
    expect(kept.map(x => x.source)).toEqual(['repo']);
  });
});

describe('topHits', () => {
  it('dedupes hits by canonical url', () => {
    const h = (url: string) => ({ source: 's', title: url, url, snippet: '' });
    expect(
      topHits([h('https://a/x?utm=1'), h('https://a/x/'), h('https://b')], 5)
    ).toHaveLength(2);
  });
});
