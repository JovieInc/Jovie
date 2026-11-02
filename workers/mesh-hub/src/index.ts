/**
 * jovie-mesh-hub: the company agent mesh on Cloudflare Workers + Durable Objects.
 * Design and failure analysis: gbrain projects/jovie/agent-mesh-hub-architecture-2026-10-31.
 * No Vercel, Gem or Mac in the delivery path.
 */
import {
  type Envelope,
  HubError,
  KIND,
  LIMITS,
  SYSTEM_KINDS,
  sha256Hex,
  validateSend,
} from './core.ts';
import type { Env } from './env.ts';
import { type AgentEntry } from './registry.ts';
import { scanBody } from './scan.ts';

export { Mailbox } from './mailbox.ts';
export { Registry } from './registry.ts';

const AUTH_CACHE_MS = 60_000;
/** Isolate-local positive auth cache: a Registry blip does not stop warm traffic. */
const authCache = new Map<string, { kind: string; expires: number }>();

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });

const failure = (status: number, code: string, retryable = false) =>
  json(status, { ok: false, code, retryable });

function registry(env: Env) {
  return env.REGISTRY.get(env.REGISTRY.idFromName('registry'));
}
function mailbox(env: Env, kind: string) {
  return env.MAILBOX.get(env.MAILBOX.idFromName(kind));
}

function bearer(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9._~+/=-]{32,512})$/.exec(header);
  return match?.[1] ?? null;
}

async function authenticate(request: Request, env: Env): Promise<string> {
  const token = bearer(request);
  if (!token) throw new HubError(401, 'unauthorized');
  const hash = await sha256Hex(token);
  const cached = authCache.get(hash);
  if (cached && cached.expires > Date.now()) {
    // Keep presence fresh without blocking the request on the Registry.
    registry(env)
      .authorize(hash)
      .catch(() => undefined);
    return cached.kind;
  }
  let result: { kind: string } | null;
  try {
    result = await registry(env).authorize(hash);
  } catch {
    throw new HubError(503, 'registry_unavailable', true);
  }
  if (!result) throw new HubError(401, 'unauthorized');
  authCache.set(hash, {
    kind: result.kind,
    expires: Date.now() + AUTH_CACHE_MS,
  });
  return result.kind;
}

async function isAdmin(request: Request, env: Env): Promise<boolean> {
  const token = bearer(request);
  if (!token || !env.HUB_ADMIN_TOKEN) return false;
  // Compare digests so timing does not leak the token.
  return (await sha256Hex(token)) === (await sha256Hex(env.HUB_ADMIN_TOKEN));
}

async function readJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new HubError(413, 'body_too_large');
  try {
    return JSON.parse(text);
  } catch {
    throw new HubError(400, 'invalid_json');
  }
}

async function send(
  request: Request,
  env: Env,
  from: string
): Promise<Response> {
  const input = await validateSend(await readJson(request));
  const verdict = scanBody(
    `${input.body}\n${(input.refs as string[]).join('\n')}`
  );
  if (!verdict.ok) return failure(422, verdict.code);
  const active = await registry(env).activeKinds();
  let recipients: string[];
  if (input.to === 'all') recipients = active.filter(kind => kind !== from);
  else if (input.to === from) return failure(422, 'invalid_recipient');
  else if (!active.includes(input.to)) return failure(422, 'unknown_recipient');
  else recipients = [input.to];
  if (!recipients.length) return failure(422, 'unknown_recipient');
  const envelope: Envelope = {
    id: `${from}:${input.correlationId}`,
    from,
    to: input.to,
    correlationId: input.correlationId,
    sha256: input.sha256,
    body: input.body,
    refs: input.refs as string[],
    inReplyTo: (input.inReplyTo as string | null) ?? null,
    sentAt: (input.sentAt as string | null) ?? null,
    acceptedAt: Date.now(),
    kind: 'message',
  };
  const result = await mailbox(env, from).submit(envelope, recipients);
  if (!result.ok)
    return failure(result.status, result.code, result.status === 429);
  const conflicts = result.recipients.filter(
    status => status.state === 'conflict'
  );
  if (conflicts.length === result.recipients.length)
    return failure(409, 'correlation_conflict');
  return json(202, {
    ok: true,
    status: 'accepted',
    id: envelope.id,
    correlationId: envelope.correlationId,
    from,
    to: input.to,
    replay: result.replay,
    // Delivery to anything still pending is driven by the hub; no client retry needed.
    delivered: result.recipients.filter(
      s => s.state === 'stored' || s.state === 'replay'
    ).length,
    recipients: result.recipients.map(({ to, state, seq }) => ({
      to,
      state,
      seq,
    })),
  });
}

function parseIds(body: unknown): string[] {
  const ids = (body as { ids?: unknown })?.ids;
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 500 ||
    ids.some(id => typeof id !== 'string' || id.length > 300)
  )
    throw new HubError(422, 'invalid_ack');
  return ids as string[];
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/health') {
    const status = await registry(env).status();
    return json(status.sweepHealthy ? 200 : 503, {
      ok: status.sweepHealthy,
      service: 'jovie-mesh-hub',
      lastSweepAt: status.lastSweepAt,
    });
  }
  if (path.startsWith('/v1/admin/')) {
    if (!(await isAdmin(request, env))) return failure(401, 'unauthorized');
    if (path === '/v1/admin/agents' && request.method === 'PUT') {
      const body = (await readJson(request, 65_536)) as {
        agents?: AgentEntry[];
      };
      if (!Array.isArray(body?.agents))
        return failure(422, 'invalid_registration');
      try {
        return json(200, {
          ok: true,
          ...(await registry(env).upsert(body.agents)),
        });
      } catch {
        return failure(422, 'invalid_registration');
      }
    }
    if (path === '/v1/admin/sweep' && request.method === 'POST')
      return json(200, { ok: true, ...(await registry(env).sweep()) });
    return failure(404, 'not_found');
  }
  const kind = await authenticate(request, env);
  if (path === '/v1/send' && request.method === 'POST')
    return send(request, env, kind);
  if (path === '/v1/mailbox' && request.method === 'GET') {
    const wait = Number(url.searchParams.get('wait') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? LIMITS.pageSize);
    const messages = await mailbox(env, kind).poll(
      Number.isFinite(wait) ? wait : 0,
      Number.isFinite(limit) && limit > 0 ? limit : LIMITS.pageSize
    );
    return json(200, {
      ok: true,
      recipient: kind,
      dataNotInstructions: true,
      messages,
    });
  }
  if (path === '/v1/history' && request.method === 'GET') {
    const since =
      Date.parse(url.searchParams.get('since') ?? '') ||
      Date.now() - 86_400_000;
    const limit = Number(url.searchParams.get('limit') ?? LIMITS.pageSize);
    const after = Number(url.searchParams.get('after') ?? 0);
    const { messages, nextAfter } = await mailbox(env, kind).history(
      since,
      Number.isFinite(limit) && limit > 0 ? limit : LIMITS.pageSize,
      Number.isFinite(after) && after > 0 ? after : 0
    );
    return json(200, {
      ok: true,
      recipient: kind,
      dataNotInstructions: true,
      messages,
      // Non-null means the page was full: repeat with ?after=<nextAfter>.
      nextAfter,
    });
  }
  if (
    (path === '/v1/ack' || path === '/v1/receipt') &&
    request.method === 'POST'
  ) {
    const ids = parseIds(await readJson(request));
    const box = mailbox(env, kind);
    return json(200, {
      ok: true,
      ...(path === '/v1/ack' ? await box.ack(ids) : await box.receipt(ids)),
    });
  }
  if (path === '/v1/stream' && request.method === 'GET')
    return mailbox(env, kind).fetch(request);
  if (path === '/v1/agents' && request.method === 'GET')
    return json(200, {
      ok: true,
      self: kind,
      agents: await registry(env).directory(),
    });
  if (path === '/v1/status' && request.method === 'GET')
    return json(200, {
      ok: true,
      self: kind,
      ...(await registry(env).status()),
    });
  if (path === '/v1/metrics' && request.method === 'GET') {
    const hours = Math.min(
      Math.max(Number(url.searchParams.get('hours') ?? 24) || 24, 1),
      24 * 30
    );
    return json(200, {
      ok: true,
      ...(await registry(env).metrics(hours * 3_600_000)),
    });
  }
  return failure(404, 'not_found');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof HubError)
        return failure(error.status, error.code, error.retryable);
      return failure(503, 'hub_unavailable', true);
    }
  },
  /** Cron (every minute): the Registry sweep. Cron is the dead-man for alarms. */
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ) {
    ctx.waitUntil(registry(env).sweep());
  },
} satisfies ExportedHandler<Env>;

export const __test = { bearer, parseIds, KIND, SYSTEM_KINDS };
