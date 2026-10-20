/**
 * `jovie-research bench`: the 20-question harness from the 2026-10-20
 * measurement, reusable for every re-evaluation. It runs the router (fresh,
 * nothing persisted) against one or more baselines (direct provider calls)
 * and scores every result set with one independent judge, so a new tool,
 * model or price can be compared on cash, latency and quality before a
 * decision is superseded.
 */
import { readFileSync } from 'node:fs';
import type { ProviderClients } from './credentials.ts';
import { callSource, type GatewaySource } from './gateway.ts';
import type { Router } from './router.ts';
import type { ResearchState } from './state.ts';
import type { Freshness, Hit, Judge } from './types.ts';

export interface BenchQuestion {
  readonly query: string;
  readonly freshness?: Freshness;
}

/** Real questions from the 2026-10-20 session (pricing, APIs, internal ops). */
export const DEFAULT_QUESTIONS: readonly BenchQuestion[] = [
  { query: 'What does Exa charge per search request?', freshness: 'month' },
  { query: 'Firecrawl search API credit cost per result', freshness: 'month' },
  {
    query: 'Cloudflare Workers AI Clef decision model pricing',
    freshness: 'month',
  },
  {
    query: 'Vercel AI Gateway Jev evaluation model pricing',
    freshness: 'month',
  },
  {
    query: 'Cloudflare Browser Rendering markdown endpoint pricing and limits',
    freshness: 'month',
  },
  { query: 'What is Exa Agent Ultra and how is it priced', freshness: 'week' },
  { query: 'Perplexity Sonar API price per request', freshness: 'month' },
  {
    query: 'Hyperagent MCP create_thread get_thread polling',
    freshness: 'evergreen',
  },
  {
    query: 'How does the hyperagent lane prove health',
    freshness: 'evergreen',
  },
  {
    query: 'gbrain takes_supersede semantics for decisions',
    freshness: 'evergreen',
  },
  {
    query: 'last30days skill ScrapeCreators free calls',
    freshness: 'evergreen',
  },
  {
    query: 'MCP streamable HTTP Mcp-Session-Id header',
    freshness: 'evergreen',
  },
  {
    query: 'Parallel.ai search API pricing compared with Exa',
    freshness: 'month',
  },
  {
    query: 'Tavily vs Exa vs Brave search API for AI agents 2026',
    freshness: 'month',
  },
  {
    query: 'AI SDK experimental_evaluate evaluation model API',
    freshness: 'week',
  },
  {
    query:
      'Cloudflare Workers AI REST API authentication with wrangler OAuth token',
    freshness: 'evergreen',
  },
  {
    query: 'Jovie budgeted api client provider contract budget headers',
    freshness: 'evergreen',
  },
  {
    query: 'Node 24 type stripping run TypeScript bin without build',
    freshness: 'evergreen',
  },
  {
    query:
      'GitHub GITHUB_TOKEN REST rate limit 1000 requests per hour per repository',
    freshness: 'evergreen',
  },
  { query: 'Firecrawl free plan monthly credits', freshness: 'month' },
];

export function loadQuestions(path: string | undefined): BenchQuestion[] {
  if (!path) return [...DEFAULT_QUESTIONS];
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!Array.isArray(parsed))
    throw new Error('bench questions must be a JSON array');
  return parsed.map(q =>
    typeof q === 'string' ? { query: q } : (q as BenchQuestion)
  );
}

/** A baseline is one direct provider call per question: `exa`, `exa:fast`, `exa:instant`, `firecrawl`. */
export async function baselineHits(
  deps: { state: ResearchState; clients: ProviderClients },
  baseline: string,
  q: BenchQuestion
): Promise<{ hits: Hit[]; usd: number }> {
  const [source, variant] = baseline.split(':') as [
    GatewaySource,
    string | undefined,
  ];
  if (source === 'exa') {
    const out = await callSource(deps, 'exa', {
      path: '/search',
      body: {
        query: q.query,
        numResults: 8,
        type: variant ?? 'auto',
        contents: { highlights: { numSentences: 3, highlightsPerUrl: 2 } },
      },
      caller: `bench:${baseline}`,
      idempotent: true,
    });
    const body = out.body as {
      results?: { url: string; title?: string; highlights?: string[] }[];
    };
    return {
      usd: out.usd,
      hits: (body.results ?? []).map(r => ({
        source: baseline,
        title: r.title ?? r.url,
        url: r.url,
        snippet: (r.highlights ?? []).join(' … ').slice(0, 600),
      })),
    };
  }
  if (source === 'firecrawl') {
    const out = await callSource(deps, 'firecrawl', {
      path: '/v1/search',
      body: { query: q.query, limit: 8 },
      caller: `bench:${baseline}`,
      idempotent: true,
    });
    const body = out.body as {
      data?: { url: string; title?: string; description?: string }[];
    };
    return {
      usd: out.usd,
      hits: (body.data ?? []).map(r => ({
        source: baseline,
        title: r.title ?? r.url,
        url: r.url,
        snippet: (r.description ?? '').slice(0, 600),
      })),
    };
  }
  throw new Error(`unknown bench baseline ${baseline}`);
}

export interface Score {
  readonly top5: number;
  readonly good: number;
  readonly answered: number;
}

export async function score(
  judge: Judge,
  query: string,
  hits: readonly Hit[]
): Promise<Score> {
  if (hits.length === 0) return { top5: 0, good: 0, answered: 0 };
  const v = await judge.judge(query, hits.slice(0, 8));
  const valid = v.scores.filter(n => !Number.isNaN(n));
  const top = [...valid].sort((a, b) => b - a).slice(0, 5);
  return {
    top5: top.reduce((a, b) => a + b, 0) / Math.max(1, top.length),
    good: valid.filter(s => s >= 2).length,
    answered: v.answered,
  };
}

export interface ArmResult {
  readonly arm: string;
  readonly usd: number;
  readonly ms: number;
  readonly score: Score;
  readonly error?: string;
}

export interface BenchRow {
  readonly query: string;
  readonly arms: readonly ArmResult[];
}

export interface ArmSummary {
  readonly arm: string;
  readonly usd: number;
  readonly medianMs: number;
  readonly top5: number;
  readonly answered: number;
  readonly winsVsRouter: number;
  readonly errors: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : 0;
};

export function summarizeBench(rows: readonly BenchRow[]): ArmSummary[] {
  const arms = [...new Set(rows.flatMap(r => r.arms.map(a => a.arm)))];
  return arms.map(arm => {
    const mine = rows.map(r => ({
      me: r.arms.find(a => a.arm === arm),
      router: r.arms.find(a => a.arm === 'router'),
    }));
    const ok = mine.map(m => m.me).filter((a): a is ArmResult => Boolean(a));
    return {
      arm,
      usd: ok.reduce((s, a) => s + a.usd, 0),
      medianMs: median(ok.map(a => a.ms)),
      top5: ok.reduce((s, a) => s + a.score.top5, 0) / Math.max(1, ok.length),
      answered:
        ok.reduce((s, a) => s + a.score.answered, 0) / Math.max(1, ok.length),
      winsVsRouter: mine.filter(
        m => m.me && m.router && m.me.score.top5 > m.router.score.top5 + 0.1
      ).length,
      errors: ok.filter(a => a.error).length,
    };
  });
}

export async function runBench(
  deps: {
    router: Router;
    state: ResearchState;
    clients: ProviderClients;
    judge: Judge;
  },
  opts: {
    questions: readonly BenchQuestion[];
    baselines: readonly string[];
    label: string;
    log?: (row: BenchRow) => void;
  }
): Promise<{ rows: BenchRow[]; summary: ArmSummary[] }> {
  const rows: BenchRow[] = [];
  for (const q of opts.questions) {
    const arms: ArmResult[] = [];
    const t0 = Date.now();
    try {
      const r = await deps.router.research({
        query: q.query,
        freshness: q.freshness,
        refresh: true,
        persist: false,
        caller: `bench:${opts.label}`,
      });
      arms.push({
        arm: 'router',
        usd: r.usd,
        ms: Date.now() - t0,
        score: await score(deps.judge, q.query, r.hits),
      });
    } catch (error) {
      arms.push({
        arm: 'router',
        usd: 0,
        ms: Date.now() - t0,
        score: { top5: 0, good: 0, answered: 0 },
        error: (error as Error).message,
      });
    }
    for (const baseline of opts.baselines) {
      const t1 = Date.now();
      try {
        const b = await baselineHits(deps, baseline, q);
        arms.push({
          arm: baseline,
          usd: b.usd,
          ms: Date.now() - t1,
          score: await score(deps.judge, q.query, b.hits),
        });
      } catch (error) {
        arms.push({
          arm: baseline,
          usd: 0,
          ms: Date.now() - t1,
          score: { top5: 0, good: 0, answered: 0 },
          error: (error as Error).message,
        });
      }
    }
    const row = { query: q.query, arms };
    rows.push(row);
    opts.log?.(row);
  }
  return { rows, summary: summarizeBench(rows) };
}

export function renderBench(
  label: string,
  summary: readonly ArmSummary[],
  n: number
): string {
  const lines = [
    `bench ${label}: ${n} questions, judged by one independent judge (top-5 relevance 0-3)`,
    'arm | cash usd | median ms | top5 | answered | wins vs router | errors',
  ];
  for (const s of summary) {
    lines.push(
      `${s.arm} | ${s.usd.toFixed(4)} | ${s.medianMs} | ${s.top5.toFixed(2)} | ${s.answered.toFixed(2)} | ${s.arm === 'router' ? '-' : s.winsVsRouter} | ${s.errors}`
    );
  }
  return lines.join('\n');
}
