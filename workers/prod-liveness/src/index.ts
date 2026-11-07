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

type State = {
  failures: number;
  pagedAt: number | null;
  incident?: string | null;
};
export function nextState(
  prev: State,
  results: Probe[],
  now: number,
  threshold: number
): { state: State; page: 'down' | 'still-down' | 'recovered' | null } {
  const down = results.some(r => !r.ok);
  if (!down)
    return {
      state: { failures: 0, pagedAt: null, incident: null },
      page: prev.pagedAt ? 'recovered' : null,
    };
  const failures = prev.failures + 1;
  if (failures < threshold)
    return {
      state: { failures, pagedAt: prev.pagedAt, incident: prev.incident },
      page: null,
    };
  if (!prev.pagedAt)
    return {
      state: { failures, pagedAt: now, incident: String(now) },
      page: 'down',
    };
  if (now - prev.pagedAt >= REPAGE_MS)
    return {
      state: { failures, pagedAt: now, incident: prev.incident },
      page: 'still-down',
    };
  return {
    state: { failures, pagedAt: prev.pagedAt, incident: prev.incident },
    page: null,
  };
}

/** Signed page to Summer's events route (POST /summer/v1/events/liveness). */
function summerPage(env: Env) {
  if (!env.SUMMER_PAGE_URL || !env.SUMMER_LIVENESS_SECRET) return null;
  return async (f: typeof fetch, payload: Record<string, string>) => {
    const body = JSON.stringify(payload);
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.SUMMER_LIVENESS_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = [
      ...new Uint8Array(
        await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
      ),
    ]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return f(env.SUMMER_PAGE_URL!, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-liveness-signature': sig,
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
  };
}
/** Transactional-stream email (notifications@send.jov.ie via Resend); the gateway is in-process in the web app, unreachable from here. */
export function sendEmail(
  env: Env,
  f: typeof fetch,
  subject: string,
  text: string,
  idempotencyKey: string
): Promise<Response> {
  if (!env.RESEND_API_KEY || !env.EMAIL_TO)
    return Promise.reject(new Error('email-unconfigured'));
  return f('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM ?? 'Jovie Alerts <notifications@send.jov.ie>',
      to: [env.EMAIL_TO],
      subject,
      text,
    }),
  });
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
    const incident =
      page === 'recovered'
        ? (prev.incident ?? String(prev.pagedAt))
        : (state.incident ?? String(now));
    const bad = results
      .filter(r => !r.ok)
      .map(r => `${r.url} ${r.cause}${r.status ? ` ${r.status}` : ''}`)
      .join('; ');
    const text =
      page === 'recovered'
        ? 'P0 production liveness recovered: jov.ie is serving again.'
        : `P0 PRODUCTION DOWN (${page}): ${bad}. Check Vercel events for project-paused first.`;
    const sent = await Promise.allSettled([
      ...urls.map(u =>
        fetchImpl(u, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            text,
            kind: 'production-liveness',
            page,
            incident,
            results,
          }),
          signal: AbortSignal.timeout(8000),
        })
      ),
      ...(summerPage(env)
        ? [summerPage(env)!(fetchImpl, { page, incident, text })]
        : []),
      // One email per incident plus one recovery email; the 30-minute re-page stays off email.
      ...(page !== 'still-down'
        ? [
            sendEmail(
              env,
              fetchImpl,
              page === 'recovered'
                ? 'Jovie production recovered'
                : 'P0: Jovie production is down',
              text,
              `liveness-${incident}-${page}`
            ),
          ]
        : []),
    ]);
    delivered = sent.filter(s => s.status === 'fulfilled' && s.value.ok).length;
    if (delivered === 0 && page !== 'recovered' && env.STATE) {
      // Nothing reached anyone: do not start the re-page quiet window, so the
      // next minute tries again instead of staying silent for 30 minutes.
      await env.STATE.put(
        'state',
        JSON.stringify({ ...state, pagedAt: prev.pagedAt })
      );
    }
    if (delivered === 0)
      console.error(
        JSON.stringify({
          channel: 'prod-liveness',
          page,
          error: 'no-page-delivered',
          text,
        })
      );
  }
  return {
    results,
    page,
    delivered,
    channels:
      urls.length + (summerPage(env) ? 1 : 0) + (env.RESEND_API_KEY ? 1 : 0),
  };
}

export default {
  async scheduled(_event: unknown, env: Env) {
    await run(env);
  },
  async fetch(req: Request, env: Env) {
    if (req.method === 'POST' && new URL(req.url).pathname === '/test-page') {
      const ok =
        env.SUMMER_LIVENESS_SECRET &&
        req.headers.get('authorization') ===
          `Bearer ${env.SUMMER_LIVENESS_SECRET}`;
      if (!ok) return new Response('unauthorized', { status: 401 });
      const res = await sendEmail(
        env,
        fetch,
        'TEST: Jovie production liveness page',
        'This is a test page from jovie-prod-liveness. No incident.',
        `liveness-test-${Date.now()}`
      );
      return new Response(JSON.stringify({ email: res.status }), {
        headers: { 'content-type': 'application/json' },
      });
    }
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
