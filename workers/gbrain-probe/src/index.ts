/**
 * gbrain-probe (JOV-10028): off-Mac, hard-gated dead-man for the gbrain read path.
 *
 * A cron fail-safe (no event exists for "the memory endpoint died") probes the PUBLIC
 * endpoint the way Summer's `gbrainRead` receipt does (whoami, source-scoped list_pages
 * limit 1) plus a real keyword `search`, and `memory-health`. The latest result is kept in KV and served
 * at GET /status in the receipt shape the automation-liveness workflow reads:
 *   { status: "verified" | "degraded" | "down", observedAt, consecutiveFailures, ... }
 * `observedAt` only advances on a fully green probe, so silence and failure look the same
 * to the dead-man. Two consecutive failed probes flip status to "down" (1 = "degraded").
 */
export interface Env {
  STATE: KVNamespace;
  GBRAIN_PROBE_TOKEN: string;
  MCP_URL?: string; // default https://memory.timwhite.co/mcp
  HEALTH_URL?: string; // default https://memory-health.timwhite.co/health
  ALERT_WEBHOOK_URL?: string; // optional: POSTed once when status becomes "down", and every 30 min while down
}

const UA = 'jovie-gbrain-probe/1';
const STATE_KEY = 'probe:state';

export interface ProbeState {
  status: 'verified' | 'degraded' | 'down';
  observedAt: string | null; // last fully green probe
  lastAttemptAt: string;
  consecutiveFailures: number;
  servedVersion: string | null;
  latencyMs: Record<string, number>;
  lastError: string | null;
  lastAlertAt: string | null;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ v: T; ms: number }> {
  const t = Date.now();
  const v = await fn();
  return { v, ms: Date.now() - t };
}

async function mcp(env: Env, name: string, args: Record<string, unknown>, timeoutMs: number): Promise<string> {
  const res = await fetch(env.MCP_URL ?? 'https://memory.timwhite.co/mcp', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GBRAIN_PROBE_TOKEN}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'user-agent': UA,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const raw = await res.text();
  const m = raw.match(/data: (\{.*\})/);
  const body = JSON.parse(m ? m[1] : raw) as { result?: { isError?: boolean; content?: { text?: string }[] }; error?: unknown };
  if (body.error || !body.result || body.result.isError) throw new Error(`${name}: tool error`);
  return body.result.content?.[0]?.text ?? '';
}

/** One probe pass. Throws on the first failing leg; returns per-leg latency on success. */
export async function runProbe(env: Env): Promise<{ servedVersion: string; latencyMs: Record<string, number> }> {
  const latencyMs: Record<string, number> = {};
  const h = await timed(async () => {
    const res = await fetch(env.HEALTH_URL ?? 'https://memory-health.timwhite.co/health', {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`health: HTTP ${res.status}`);
    const j = (await res.json()) as { status?: string; version?: string };
    if (j.status !== 'ok') throw new Error('health: status not ok');
    return j.version ?? 'unknown';
  });
  latencyMs.health = h.ms;
  const who = await timed(() => mcp(env, 'whoami', {}, 12_000));
  latencyMs.whoami = who.ms;
  const list = await timed(() => mcp(env, 'list_pages', { limit: 1 }, 12_000));
  latencyMs.list_pages = list.ms;
  if (!list.v || list.v.trim() === '[]') throw new Error('list_pages: empty listing');
  const search = await timed(() => mcp(env, 'search', { query: 'autonomous shipping doctrine', limit: 3 }, 20_000));
  latencyMs.search = search.ms;
  if (!search.v || search.v.trim() === '[]') throw new Error('search: no results');
  return { servedVersion: h.v, latencyMs };
}

/** Pure state transition, exported for tests. */
export function nextState(prev: ProbeState | null, now: string, outcome: { ok: true; servedVersion: string; latencyMs: Record<string, number> } | { ok: false; error: string }): ProbeState {
  const base: ProbeState = prev ?? { status: 'degraded', observedAt: null, lastAttemptAt: now, consecutiveFailures: 0, servedVersion: null, latencyMs: {}, lastError: null, lastAlertAt: null };
  if (outcome.ok) {
    return { ...base, status: 'verified', observedAt: now, lastAttemptAt: now, consecutiveFailures: 0, servedVersion: outcome.servedVersion, latencyMs: outcome.latencyMs, lastError: null };
  }
  const failures = base.consecutiveFailures + 1;
  return { ...base, status: failures >= 2 ? 'down' : 'degraded', lastAttemptAt: now, consecutiveFailures: failures, lastError: outcome.error.slice(0, 200) };
}

export async function tick(env: Env, now = new Date().toISOString()): Promise<ProbeState> {
  const prev = await env.STATE.get<ProbeState>(STATE_KEY, 'json');
  let outcome: Parameters<typeof nextState>[2];
  try {
    const r = await runProbe(env);
    outcome = { ok: true, ...r };
  } catch (e) {
    // one immediate retry inside the same run so a single blip does not count as a failed probe pass
    try {
      const r = await runProbe(env);
      outcome = { ok: true, ...r };
    } catch (e2) {
      outcome = { ok: false, error: e2 instanceof Error ? e2.message : String(e2) };
    }
  }
  let next = nextState(prev, now, outcome);
  if (next.status === 'down' && env.ALERT_WEBHOOK_URL) {
    const last = next.lastAlertAt ? Date.parse(next.lastAlertAt) : 0;
    if (Date.parse(now) - last >= 30 * 60_000) {
      try {
        await fetch(env.ALERT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'user-agent': UA },
          body: JSON.stringify({ source: 'gbrain-probe', status: 'down', consecutiveFailures: next.consecutiveFailures, lastError: next.lastError, lastOkAt: next.observedAt }),
          signal: AbortSignal.timeout(10_000),
        });
        next = { ...next, lastAlertAt: now };
      } catch {
        /* alert sink failure must not hide the receipt; liveness workflow is the second path */
      }
    }
  }
  await env.STATE.put(STATE_KEY, JSON.stringify(next));
  return next;
}

export default {
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(tick(env));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/status') {
      const s = await env.STATE.get<ProbeState>(STATE_KEY, 'json');
      // No state yet means never probed: report unknown so the dead-man reads it as silence.
      return Response.json(s ?? { status: 'unknown', observedAt: null }, { headers: { 'cache-control': 'no-store' } });
    }
    return new Response('gbrain-probe', { status: 200 });
  },
};
