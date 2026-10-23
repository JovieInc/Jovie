/**
 * The research router: cache → local (gbrain, repo) → credits/free → paid,
 * judged after every tier so we stop as soon as the evidence is good enough.
 */
import { extractUrls, inferFreshness, queryKey } from './normalize.ts';
import type { ResearchState } from './state.ts';
import {
  type Freshness,
  type Hit,
  type Judge,
  type Mode,
  type ResearchRequest,
  type ResearchResult,
  SOURCES,
  type SourceRun,
  type SourcesConfig,
  type Verdict,
} from './types.ts';

export interface SourceCall {
  readonly query: string;
  readonly freshness: Freshness;
  readonly mode: Mode;
  readonly urls: readonly string[];
}

export interface SourceImpl {
  /** Run the source; return null when it does not apply (e.g. no URL to fetch). */
  run(
    call: SourceCall
  ): Promise<{ hits: Hit[]; usd?: number; answer?: string } | null>;
  /** False when the credential is missing; reported as a skip, never an error. */
  available(): boolean | Promise<boolean>;
}

export interface RouterDeps {
  readonly state: ResearchState;
  readonly sources: Readonly<Record<string, SourceImpl>>;
  readonly judges: readonly Judge[];
  readonly prior?: (
    query: string
  ) => Promise<{ slug: string; title: string }[]>;
  readonly loadPersisted?: (key: string) => Promise<ResearchResult | null>;
  /** gbrain page a persisted result lands on (shown to callers immediately). */
  readonly slugFor?: (key: string) => string;
  readonly persist?: (
    result: ResearchResult,
    caller?: string
  ) => Promise<string>;
  readonly config?: SourcesConfig;
  readonly now?: () => number;
}

/** Which sources run at each tier for a request. Order within a tier is parallel. */
export function plan(
  req: Required<Pick<ResearchRequest, 'mode' | 'social'>>,
  urls: readonly string[]
) {
  const tiers: string[][] = [['gbrain', 'repo'], [], []];
  if (urls.length) tiers[1].push('cloudflare-fetch');
  tiers[1].push('firecrawl');
  if (req.social) tiers[1].push('last30days');
  if (req.mode === 'deep') tiers[1].push('hyperagent');
  tiers[2].push('exa');
  if (req.mode === 'deep') tiers[2].push('perplexity');
  return tiers;
}

export const LOCAL_SOURCES = new Set(['gbrain', 'repo']);

const inflight = new Map<string, Promise<ResearchResult>>();

export function createRouter(deps: RouterDeps) {
  const config = deps.config ?? SOURCES;
  const now = deps.now ?? Date.now;
  const pending = new Set<Promise<unknown>>();

  /** First judge that answers wins; failures are recorded as tier -1 runs. */
  async function judge(
    query: string,
    hits: Hit[],
    runs: SourceRun[]
  ): Promise<Verdict | null> {
    if (hits.length === 0) return null;
    for (const j of deps.judges) {
      const spec = config.sources[j.name];
      const blocked = await deps.state.reserve(
        j.name,
        spec?.caps,
        spec?.usdPerCall ?? 0
      );
      if (blocked) {
        runs.push({
          source: j.name,
          tier: -1,
          ok: false,
          hits: 0,
          ms: 0,
          usd: 0,
          skipped: `cap ${blocked}`,
        });
        continue;
      }
      const started = now();
      try {
        const verdict = await j.judge(query, hits);
        await deps.state.settle(j.name, spec?.usdPerCall ?? 0, verdict.usd);
        return verdict;
      } catch (error) {
        await deps.state.settle(j.name, spec?.usdPerCall ?? 0, 0);
        runs.push({
          source: j.name,
          tier: -1,
          ok: false,
          hits: 0,
          ms: now() - started,
          usd: 0,
          error: (error as Error).message.slice(0, 160),
        });
      }
    }
    return null;
  }

  async function runSource(
    name: string,
    tier: number,
    call: SourceCall
  ): Promise<{ run: SourceRun; hits: Hit[]; answer?: string }> {
    const impl = deps.sources[name];
    const spec = config.sources[name];
    const started = now();
    const skip = (skipped: string) => ({
      run: { source: name, tier, ok: false, hits: 0, ms: 0, usd: 0, skipped },
      hits: [],
    });
    if (!impl || !spec) return skip('not configured');
    if (!(await impl.available())) return skip('no credential');
    const estimate = spec.usdPerCall ?? 0;
    if (spec.caps) {
      const blocked = await deps.state.reserve(name, spec.caps, estimate);
      if (blocked) return skip(`cap ${blocked}`);
    }
    try {
      const out = await impl.run(call);
      if (!out) return skip('not applicable');
      const usd = out.usd ?? estimate;
      if (spec.caps) await deps.state.settle(name, estimate, usd);
      return {
        run: {
          source: name,
          tier,
          ok: true,
          hits: out.hits.length,
          ms: now() - started,
          usd,
        },
        hits: out.hits,
        answer: out.answer,
      };
    } catch (error) {
      // A failed call returned nothing billable; release the reserved estimate.
      if (spec.caps) await deps.state.settle(name, estimate, 0);
      return {
        run: {
          source: name,
          tier,
          ok: false,
          hits: 0,
          ms: now() - started,
          usd: 0,
          error: (error as Error).message.slice(0, 160),
        },
        hits: [],
      };
    }
  }

  async function execute(
    req: ResearchRequest,
    key: string,
    freshness: Freshness,
    mode: Mode
  ): Promise<ResearchResult> {
    const started = now();
    const urls = extractUrls(req.query);
    const call: SourceCall = { query: req.query, freshness, mode, urls };
    const tiers = plan({ mode, social: req.social ?? false }, urls);
    const maxTier = req.localOnly ? 0 : (req.maxTier ?? 2);
    const enough = config.judge.enoughGood[mode];
    const runs: SourceRun[] = [];
    let pool: Hit[] = [];
    let kept: Hit[] = [];
    let dropped = 0;
    let answer: string | undefined;
    let stoppedAtTier = 0;
    const judgeTotals = { model: null as string | null, usd: 0, ms: 0 };
    const priorPromise =
      deps.prior?.(req.query).catch(() => []) ?? Promise.resolve([]);

    for (let tier = 0; tier <= Math.min(maxTier, tiers.length - 1); tier++) {
      if (tiers[tier].length === 0) continue;
      stoppedAtTier = tier;
      const outputs = await Promise.all(
        tiers[tier].map(name => runSource(name, tier, call))
      );
      for (const o of outputs) {
        runs.push(o.run);
        pool.push(...o.hits);
        answer ??= o.answer;
      }
      pool = topHits(pool, 40);
      const verdict = await judge(req.query, pool, runs);
      if (verdict) {
        judgeTotals.model = verdict.model;
        judgeTotals.usd += verdict.usd;
        judgeTotals.ms += verdict.ms;
        const applied = applyVerdict(
          pool,
          verdict.scores,
          config.judge.keepScore
        );
        kept = applied.kept;
        dropped = applied.dropped;
        pool = kept;
        const good = kept.filter(
          h => (h.score ?? 0) >= config.judge.goodScore
        ).length;
        if (good >= enough || (verdict.answered >= 0.7 && good >= 1)) break;
      } else {
        kept = pool;
        if (pool.filter(h => h.source !== 'repo').length >= enough * 2) break;
      }
    }

    const usd = runs.reduce((s, r) => s + r.usd, 0) + judgeTotals.usd;
    const ttl = config.freshnessTtlMs[freshness];
    return {
      schema: 'jovie-research-result/v1',
      query: req.query,
      key,
      freshness,
      mode,
      social: req.social ?? false,
      createdAt: new Date(started).toISOString(),
      expiresAt: new Date(started + ttl).toISOString(),
      cache: 'miss',
      stoppedAtTier,
      escalated: stoppedAtTier > 0,
      hits: topHits(kept, 10),
      dropped,
      runs,
      judge: judgeTotals,
      usd,
      ms: now() - started,
      answer,
      priorDecisions: await priorPromise,
    };
  }

  async function research(req: ResearchRequest): Promise<ResearchResult> {
    const started = now();
    const freshness = req.freshness ?? inferFreshness(req.query);
    const mode = req.mode ?? 'standard';
    const key = queryKey(req.query, freshness, mode, req.social);
    const finish = async (result: ResearchResult) => {
      await deps.state.log({
        event: 'research',
        key,
        caller: req.caller ?? 'unknown',
        mode,
        freshness,
        cache: result.cache,
        tier: result.stoppedAtTier,
        usd: result.cache === 'miss' ? result.usd : 0,
        ms: now() - started,
        hits: result.hits.length,
        sources: result.runs.filter(r => r.ok).map(r => r.source),
      });
      return result.cache === 'miss'
        ? result
        : { ...result, ms: now() - started };
    };

    if (!req.refresh) {
      const local = await deps.state.getCached(key);
      if (local) return finish({ ...local, cache: 'local' });
      const similar = await deps.state.findSimilar(req.query, {
        freshness,
        mode,
        social: req.social ?? false,
      });
      if (similar) return finish({ ...similar, cache: 'similar' });
      const persisted = await deps.loadPersisted?.(key).catch(() => null);
      if (persisted) {
        await deps.state.putCached(persisted);
        return finish({ ...persisted, cache: 'gbrain' });
      }
    }

    const running = inflight.get(key);
    if (running) return finish({ ...(await running), cache: 'inflight' });

    const owned = await deps.state.claim(key);
    if (!owned) {
      const waited = await deps.state.waitFor(
        key,
        mode === 'deep' ? 600_000 : 120_000
      );
      if (waited) return finish({ ...waited, cache: 'inflight' });
    }

    const work = (async () => {
      try {
        let result = await execute(req, key, freshness, mode);
        if (
          req.persist !== false &&
          result.stoppedAtTier > 0 &&
          result.hits.length > 0 &&
          deps.persist
        ) {
          // Writing a gbrain page (chunk + embed) takes 5-20s; never make the
          // caller wait for it. CLI callers await flush() after printing.
          const write = deps
            .persist(result, req.caller)
            .then(slug => deps.state.log({ event: 'persist', key, slug }))
            .catch((error: Error) =>
              deps.state.log({
                event: 'persist-failed',
                key,
                error: error.message.slice(0, 160),
              })
            )
            .finally(() => pending.delete(write));
          pending.add(write);
          if (deps.slugFor)
            result = { ...result, gbrainSlug: deps.slugFor(key) };
        }
        await deps.state.putCached(result);
        return result;
      } finally {
        if (owned) await deps.state.release(key);
      }
    })();
    inflight.set(key, work);
    try {
      return finish(await work);
    } finally {
      inflight.delete(key);
    }
  }

  /** Wait for background gbrain writes (call before a short-lived process exits). */
  async function flush(): Promise<void> {
    while (pending.size) await Promise.allSettled([...pending]);
  }

  return { research, flush };
}

export type Router = ReturnType<typeof createRouter>;

/** First `n` hits with distinct canonical URLs (query string, fragment and trailing slash ignored). */
export function topHits(hits: readonly Hit[], n: number): Hit[] {
  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const h of hits) {
    const id = h.url.replace(/[?#].*$/, '').replace(/\/$/, '');
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(h);
    if (out.length >= n) break;
  }
  return out;
}

/** Rerank by score, drop junk, keep unscored hits (judge beyond MAX_HITS) at the end. */
/**
 * Rerank by score and drop junk. Local evidence (gbrain, repo) gets a 0.5
 * lower bar: it is free, ours, and cheap for an agent to open and verify.
 */
export function applyVerdict(
  hits: readonly Hit[],
  scores: readonly number[],
  keepScore: number
): { kept: Hit[]; dropped: number } {
  const bar = (h: Hit) =>
    LOCAL_SOURCES.has(h.source) ? keepScore - 0.5 : keepScore;
  const scored = hits.map((hit, i) => ({
    ...hit,
    score: Number.isNaN(scores[i]) ? undefined : scores[i],
  }));
  const kept = scored.filter(h => h.score === undefined || h.score >= bar(h));
  kept.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return { kept, dropped: scored.length - kept.length };
}
