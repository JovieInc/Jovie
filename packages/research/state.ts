/**
 * Host-wide research state: the normalized-query cache, cross-process
 * in-flight markers, per-source spend caps and the metrics log. Files live
 * under JOVIE_RESEARCH_STATE_DIR (default ~/.local/state/jovie-research) so
 * every agent on the machine shares one cache and one budget.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { similarity } from './normalize.ts';
import type { Caps, ResearchResult } from './types.ts';

export function stateRoot(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.JOVIE_RESEARCH_STATE_DIR ??
    join(homedir(), '.local', 'state', 'jovie-research')
  );
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function writeAtomic(path: string, data: string): Promise<void> {
  const tmp = `${path}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, path);
}

/** mkdir lock, same convention as @jovie/api-client's FileLedgerStore. */
export async function withLock<T>(
  path: string,
  fn: () => Promise<T>,
  { staleMs = 10_000, timeoutMs = 5_000 } = {}
): Promise<T> {
  const lock = `${path}.lock`;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fs.mkdir(lock);
      break;
    } catch {
      const stat = await fs.stat(lock).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > staleMs) {
        await fs.rm(lock, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) throw new Error(`lock timeout: ${lock}`);
      await sleep(10 + Math.floor(Math.random() * 30));
    }
  }
  try {
    return await fn();
  } finally {
    await fs.rm(lock, { recursive: true, force: true });
  }
}

export class ResearchState {
  readonly root: string;
  private readonly now: () => number;

  constructor(root = stateRoot(), now: () => number = Date.now) {
    this.root = root;
    this.now = now;
  }

  private path(...parts: string[]): string {
    return join(this.root, ...parts);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.path('cache'), { recursive: true });
    await fs.mkdir(this.path('inflight'), { recursive: true });
  }

  // ---- normalized-query cache -------------------------------------------

  async getCached(key: string): Promise<ResearchResult | null> {
    try {
      const raw = await fs.readFile(this.path('cache', `${key}.json`), 'utf8');
      const result = JSON.parse(raw) as ResearchResult;
      return Date.parse(result.expiresAt) > this.now() ? result : null;
    } catch {
      return null;
    }
  }

  /**
   * Near-duplicate lookup: an unexpired result for a paraphrase of the same
   * question (same freshness and mode). Scans at most `limit` newest entries.
   */
  async findSimilar(
    query: string,
    match: { freshness: string; mode: string; social: boolean },
    threshold = 0.75,
    limit = 2000
  ): Promise<ResearchResult | null> {
    let names: string[];
    try {
      names = (await fs.readdir(this.path('cache'))).filter(n =>
        n.endsWith('.json')
      );
    } catch {
      return null;
    }
    let best: { score: number; result: ResearchResult } | null = null;
    for (const name of names.slice(-limit)) {
      const result = await this.getCached(name.slice(0, -5));
      if (
        !result ||
        result.freshness !== match.freshness ||
        result.mode !== match.mode
      )
        continue;
      if ((result.social ?? false) !== match.social) continue;
      const score = similarity(query, result.query);
      if (score >= threshold && (!best || score > best.score))
        best = { score, result };
    }
    return best?.result ?? null;
  }

  async putCached(result: ResearchResult): Promise<void> {
    await this.init();
    await writeAtomic(
      this.path('cache', `${result.key}.json`),
      JSON.stringify(result)
    );
  }

  // ---- raw provider-response cache (gateway) ----------------------------

  async getRaw(key: string, maxAgeMs: number): Promise<unknown | null> {
    try {
      const raw = JSON.parse(
        await fs.readFile(this.path('raw', `${key}.json`), 'utf8')
      ) as { storedAt: number; body: unknown };
      return this.now() - raw.storedAt < maxAgeMs ? raw.body : null;
    } catch {
      return null;
    }
  }

  async putRaw(key: string, body: unknown): Promise<void> {
    await fs.mkdir(this.path('raw'), { recursive: true });
    await writeAtomic(
      this.path('raw', `${key}.json`),
      JSON.stringify({ storedAt: this.now(), body })
    );
  }

  // ---- cross-process in-flight dedupe -----------------------------------

  /** True when this process now owns the query; false when another does. */
  async claim(key: string, staleMs = 300_000): Promise<boolean> {
    await this.init();
    const marker = this.path('inflight', key);
    try {
      await fs.mkdir(marker);
      return true;
    } catch {
      const stat = await fs.stat(marker).catch(() => null);
      if (stat && this.now() - stat.mtimeMs > staleMs) {
        await fs.rm(marker, { recursive: true, force: true });
        return this.claim(key, staleMs);
      }
      return false;
    }
  }

  async release(key: string): Promise<void> {
    await fs.rm(this.path('inflight', key), { recursive: true, force: true });
  }

  /** Wait for another process's result; null when it gave up or timed out. */
  async waitFor(
    key: string,
    timeoutMs: number
  ): Promise<ResearchResult | null> {
    const deadline = this.now() + timeoutMs;
    while (this.now() < deadline) {
      const hit = await this.getCached(key);
      if (hit) return hit;
      const owned = await fs
        .stat(this.path('inflight', key))
        .then(() => true)
        .catch(() => false);
      if (!owned) return this.getCached(key);
      await sleep(250);
    }
    return null;
  }

  // ---- spend caps --------------------------------------------------------

  private usagePath(): string {
    return this.path('usage.json');
  }

  private periods(): { day: string; month: string } {
    const iso = new Date(this.now()).toISOString();
    return { day: iso.slice(0, 10), month: iso.slice(0, 7) };
  }

  async readUsage(): Promise<UsageLedger> {
    try {
      return JSON.parse(
        await fs.readFile(this.usagePath(), 'utf8')
      ) as UsageLedger;
    } catch {
      return { schema: 'jovie-research-usage/v1', sources: {} };
    }
  }

  /**
   * Reserve one call against the caps. Returns null when allowed, or the
   * cap that would be exceeded. Reservation and spend share one lock so
   * parallel agents cannot both take the last call.
   */
  async reserve(
    source: string,
    caps: Caps | undefined,
    usd: number,
    /** Billable units: 1 per call, or credits/pages for unit-billed sources. */
    units = 1
  ): Promise<string | null> {
    await this.init();
    return withLock(this.usagePath(), async () => {
      const ledger = await this.readUsage();
      const { day, month } = this.periods();
      const row = rollUsage(ledger.sources[source], day, month);
      const blocked = capExceeded(row, caps, usd, units);
      if (blocked) return blocked;
      row.day.calls += units;
      row.day.usd += usd;
      row.month.calls += units;
      row.month.usd += usd;
      ledger.sources[source] = row;
      await writeAtomic(this.usagePath(), JSON.stringify(ledger, null, 2));
      return null;
    });
  }

  /** Replace an estimate with the provider-reported cost once known. */
  async settle(source: string, estimateUsd: number, actualUsd: number) {
    const delta = actualUsd - estimateUsd;
    if (Math.abs(delta) < 1e-9) return;
    await withLock(this.usagePath(), async () => {
      const ledger = await this.readUsage();
      const { day, month } = this.periods();
      const row = rollUsage(ledger.sources[source], day, month);
      row.day.usd = Math.max(0, row.day.usd + delta);
      row.month.usd = Math.max(0, row.month.usd + delta);
      ledger.sources[source] = row;
      await writeAtomic(this.usagePath(), JSON.stringify(ledger, null, 2));
    });
  }

  // ---- metrics -----------------------------------------------------------

  async log(event: Record<string, unknown>): Promise<void> {
    await this.init();
    await fs.appendFile(
      this.path('metrics.jsonl'),
      `${JSON.stringify({ at: new Date(this.now()).toISOString(), ...event })}\n`
    );
  }

  async readMetrics(): Promise<Record<string, unknown>[]> {
    try {
      const raw = await fs.readFile(this.path('metrics.jsonl'), 'utf8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as Record<string, unknown>);
    } catch {
      return [];
    }
  }
}

export interface PeriodUsage {
  key: string;
  calls: number;
  usd: number;
}

export interface SourceUsage {
  day: PeriodUsage;
  month: PeriodUsage;
}

export interface UsageLedger {
  schema: 'jovie-research-usage/v1';
  sources: Record<string, SourceUsage>;
}

export function rollUsage(
  row: SourceUsage | undefined,
  day: string,
  month: string
): SourceUsage {
  return {
    day: row?.day.key === day ? { ...row.day } : { key: day, calls: 0, usd: 0 },
    month:
      row?.month.key === month
        ? { ...row.month }
        : { key: month, calls: 0, usd: 0 },
  };
}

export function capExceeded(
  row: SourceUsage,
  caps: Caps | undefined,
  usd: number,
  units = 1
): string | null {
  if (!caps) return null;
  if (caps.dailyCalls !== undefined && row.day.calls + units > caps.dailyCalls)
    return `dailyCalls ${caps.dailyCalls}`;
  if (
    caps.monthlyCalls !== undefined &&
    row.month.calls + units > caps.monthlyCalls
  )
    return `monthlyCalls ${caps.monthlyCalls}`;
  if (caps.dailyUsd !== undefined && row.day.usd + usd > caps.dailyUsd)
    return `dailyUsd ${caps.dailyUsd}`;
  if (caps.monthlyUsd !== undefined && row.month.usd + usd > caps.monthlyUsd)
    return `monthlyUsd ${caps.monthlyUsd}`;
  return null;
}

// ---- metrics summary ----

export interface Stats {
  runs: number;
  cacheHitRate: number;
  byCache: Record<string, number>;
  byMode: Record<
    string,
    { runs: number; hits: number; usd: number; avgMs: number }
  >;
  usd: number;
  avgMs: number;
  sourceUse: Record<string, number>;
}

export function summarize(
  events: Record<string, unknown>[],
  sinceMs = 0
): Stats {
  const rows = events.filter(
    e => e.event === 'research' && Date.parse(String(e.at)) >= sinceMs
  );
  const byCache: Record<string, number> = {};
  const byMode: Stats['byMode'] = {};
  const sourceUse: Record<string, number> = {};
  let usd = 0;
  let ms = 0;
  for (const e of rows) {
    const cache = String(e.cache);
    byCache[cache] = (byCache[cache] ?? 0) + 1;
    const mode = String(e.mode);
    const m = (byMode[mode] ??= { runs: 0, hits: 0, usd: 0, avgMs: 0 });
    m.runs += 1;
    if (cache !== 'miss') m.hits += 1;
    m.usd += Number(e.usd) || 0;
    m.avgMs += Number(e.ms) || 0;
    usd += Number(e.usd) || 0;
    ms += Number(e.ms) || 0;
    if (cache === 'miss')
      for (const s of (e.sources as string[]) ?? [])
        sourceUse[s] = (sourceUse[s] ?? 0) + 1;
  }
  for (const m of Object.values(byMode))
    m.avgMs = m.runs ? Math.round(m.avgMs / m.runs) : 0;
  const hits = rows.length - (byCache.miss ?? 0);
  return {
    runs: rows.length,
    cacheHitRate: rows.length ? hits / rows.length : 0,
    byCache,
    byMode,
    usd,
    avgMs: rows.length ? Math.round(ms / rows.length) : 0,
    sourceUse,
  };
}
