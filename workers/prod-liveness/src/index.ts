/**
 * P0 production liveness probe, every minute, outside Vercel. jov.ie must answer 200 without
 * `x-vercel-error: DEPLOYMENT_PAUSED` (2026-10-29: the spend pause went unnoticed for ~1h). After
 * FAILURES_TO_PAGE consecutive failing minutes it pages every endpoint in PAGE_URLS at once, then
 * repeats every 30 minutes while down and sends one recovery page.
 */
type Env = {
  STATE?: KVNamespace;
  TARGETS?: string;
  FAILURES_TO_PAGE?: string;
  PAGE_URLS?: string;
};
type KVNamespace = {
  get(k: string): Promise<string | null>;
  put(k: string, v: string, o?: { expirationTtl?: number }): Promise<void>;
};
export type Probe = {
  url: string;
  ok: boolean;
  status: number;
  cause: 'ok' | 'paused' | 'quota' | 'http' | 'network';
};
const REPAGE_MS = 30 * 60_000;

export async function probe(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<Probe> {
  try {
    const res = await fetchImpl(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'jovie-prod-liveness/1' },
    });
    const vercelError = res.headers.get('x-vercel-error') ?? '';
    if (vercelError === 'DEPLOYMENT_PAUSED')
      return { url, ok: false, status: res.status, cause: 'paused' };
    if (res.status === 402)
      return { url, ok: false, status: res.status, cause: 'quota' };
    const ok = res.status >= 200 && res.status < 400;
    return { url, ok, status: res.status, cause: ok ? 'ok' : 'http' };
  } catch {
    return { url, ok: false, status: 0, cause: 'network' };
  }
}

type State = { failures: number; pagedAt: number | null };
export function nextState(
  prev: State,
  results: Probe[],
  now: number,
  threshold: number
): { state: State; page: 'down' | 'still-down' | 'recovered' | null } {
  const down = results.some(r => !r.ok);
  if (!down)
    return {
      state: { failures: 0, pagedAt: null },
      page: prev.pagedAt ? 'recovered' : null,
    };
  const failures = prev.failures + 1;
  if (failures < threshold)
    return { state: { failures, pagedAt: prev.pagedAt }, page: null };
  if (!prev.pagedAt) return { state: { failures, pagedAt: now }, page: 'down' };
  if (now - prev.pagedAt >= REPAGE_MS)
    return { state: { failures, pagedAt: now }, page: 'still-down' };
  return { state: { failures, pagedAt: prev.pagedAt }, page: null };
}

export async function run(
  env: Env,
  now = Date.now(),
  fetchImpl: typeof fetch = fetch
): Promise<{
  results: Probe[];
  page: string | null;
  delivered: number;
  channels: number;
}> {
  const targets = (env.TARGETS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const results = await Promise.all(targets.map(u => probe(u, fetchImpl)));
  const prev: State = env.STATE
    ? JSON.parse(
        (await env.STATE.get('state')) ?? '{"failures":0,"pagedAt":null}'
      )
    : { failures: 0, pagedAt: null };
  const { state, page } = nextState(
    prev,
    results,
    now,
    Number(env.FAILURES_TO_PAGE) || 2
  );
  if (env.STATE) await env.STATE.put('state', JSON.stringify(state));
  if (env.STATE)
    await env.STATE.put(
      'last',
      JSON.stringify({ at: new Date(now).toISOString(), results, state })
    );
  const urls = (env.PAGE_URLS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(u => u.startsWith('https://'));
  let delivered = 0;
  if (page) {
    const bad = results
      .filter(r => !r.ok)
      .map(r => `${r.url} ${r.cause}${r.status ? ` ${r.status}` : ''}`)
      .join('; ');
    const text =
      page === 'recovered'
        ? 'P0 production liveness recovered: jov.ie is serving again.'
        : `P0 PRODUCTION DOWN (${page}): ${bad}. Check Vercel events for project-paused first.`;
    const sent = await Promise.allSettled(
      urls.map(u =>
        fetchImpl(u, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            text,
            kind: 'production-liveness',
            page,
            results,
          }),
          signal: AbortSignal.timeout(8000),
        })
      )
    );
    delivered = sent.filter(s => s.status === 'fulfilled' && s.value.ok).length;
    if (delivered === 0)
      console.error(
        JSON.stringify({
          channel: 'prod-liveness',
          page,
          error: urls.length
            ? 'all-pages-failed'
            : 'no-page-channel-configured',
          text,
        })
      );
  }
  return { results, page, delivered, channels: urls.length };
}

export default {
  async scheduled(_event: unknown, env: Env) {
    await run(env);
  },
  async fetch(_req: Request, env: Env) {
    const last = env.STATE ? await env.STATE.get('last') : null;
    return new Response(
      JSON.stringify({
        last_cron_at: last ? JSON.parse(last).at : null,
        pageChannels: (env.PAGE_URLS ?? '').split(',').filter(Boolean).length,
        last: last ? JSON.parse(last) : null,
      }),
      { headers: { 'content-type': 'application/json' } }
    );
  },
};
