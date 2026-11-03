import { createHash, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  JovieInputError,
  JovieRequestError,
  readResponseBody,
} from './client.js';
import {
  type MeshDependencies,
  meshCredentials,
  meshRead,
  meshSend,
} from './mesh.js';

/**
 * Hub transport for `jovie mesh` (workers/mesh-hub; gbrain
 * projects/jovie/agent-mesh-hub-architecture-2026-10-31). The hub runs on
 * Cloudflare only. Summer's legacy inbox stays a best-effort dual-write until
 * Summer consumes the hub, so `to: summer` keeps reaching Summer's receiver.
 */
export const MESH_HUB_DEFAULT_URL =
  'https://jovie-mesh-hub.tim-fd8.workers.dev';

type Flags = Readonly<Record<string, string | undefined>>;
type Env = Readonly<Record<string, string | undefined>>;
type HubMessage = {
  id: string;
  from: string;
  to: string;
  correlationId: string;
  body: string;
  refs: string[];
  inReplyTo: string | null;
  acceptedAt: string;
  kind: string;
};

const env = (deps: MeshDependencies): Env => deps.env ?? process.env;
export const hubEnabled = (deps: MeshDependencies) =>
  env(deps).JOVIE_MESH_HUB !== '0';
const legacyEnabled = (deps: MeshDependencies) =>
  env(deps).JOVIE_MESH_LEGACY !== '0';

export function hubOrigin(deps: MeshDependencies): string {
  const raw = env(deps).JOVIE_MESH_HUB_URL?.trim() || MESH_HUB_DEFAULT_URL;
  const url = new URL(raw);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) ||
    url.username ||
    url.password
  )
    throw new JovieInputError(
      'JOVIE_MESH_HUB_URL must be an https origin (http only on loopback).'
    );
  return url.origin;
}

/** One hub call. Transport errors, 5xx, 429 and 507 are retryable; codes are fixed. */
export async function hubRequest(
  path: string,
  init: {
    method: 'GET' | 'POST';
    token: string;
    body?: unknown;
    timeoutMs?: number;
  },
  deps: MeshDependencies
): Promise<Record<string, unknown>> {
  const origin = hubOrigin(deps);
  const timeout = AbortSignal.timeout(init.timeoutMs ?? 30_000);
  const signal = deps.signal
    ? AbortSignal.any([timeout, deps.signal])
    : timeout;
  let response: Response;
  try {
    response = await (deps.fetchImpl ?? globalThis.fetch)(`${origin}${path}`, {
      method: init.method,
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${init.token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(deps.userAgent ? { 'User-Agent': deps.userAgent } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal,
    });
  } catch {
    throw new JovieRequestError(
      'Mesh hub unreachable.',
      origin,
      undefined,
      undefined,
      undefined,
      'TEMPORARILY_UNAVAILABLE',
      true
    );
  }
  let record: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(
      await readResponseBody(response, signal)
    );
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      record = parsed as Record<string, unknown>;
  } catch {
    throw new JovieRequestError(
      'Invalid mesh hub response.',
      origin,
      response.status,
      undefined,
      undefined,
      'TEMPORARILY_UNAVAILABLE',
      true
    );
  }
  if (response.ok && record.ok === true) return record;
  const code =
    typeof record.code === 'string' && /^[a-z_]{3,40}$/.test(record.code)
      ? record.code
      : undefined;
  const retryable = response.status >= 500 || response.status === 429;
  throw new JovieRequestError(
    `Mesh hub returned HTTP ${response.status}${code ? ` (${code})` : ''}.`,
    origin,
    response.status,
    undefined,
    undefined,
    code,
    retryable
  );
}

/** Local durable outbox: written before any network call, flushed oldest first. */
export function outboxDir(kind: string, deps: MeshDependencies): string {
  const root =
    env(deps).JOVIE_MESH_STATE_DIR?.trim() ||
    join(env(deps).HOME || homedir(), '.jovie', 'mesh');
  return join(root, kind, 'outbox');
}

type OutboxEntry = {
  correlationId: string;
  to: string;
  body: string;
  refs: string[];
  createdAt: string;
};
const OUTBOX_TTL_MS = 7 * 86_400_000;

function writeOutbox(dir: string, entry: OutboxEntry) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, `${Date.now()}-${entry.correlationId}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify(entry), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
  return file;
}

function listOutbox(dir: string): { file: string; entry: OutboxEntry }[] {
  let names: string[] = [];
  try {
    names = readdirSync(dir)
      .filter(name => name.endsWith('.json'))
      .sort();
  } catch {
    return [];
  }
  return names.flatMap(name => {
    try {
      return [
        {
          file: join(dir, name),
          entry: JSON.parse(
            readFileSync(join(dir, name), 'utf8')
          ) as OutboxEntry,
        },
      ];
    } catch {
      return [];
    }
  });
}

async function postToHub(
  entry: OutboxEntry,
  token: string,
  deps: MeshDependencies
) {
  return hubRequest(
    '/v1/send',
    {
      method: 'POST',
      token,
      body: {
        to: entry.to,
        correlationId: entry.correlationId,
        sha256: createHash('sha256').update(entry.body).digest('hex'),
        body: entry.body,
        refs: entry.refs,
        sentAt: entry.createdAt,
      },
    },
    deps
  );
}

/**
 * Flush queued sends in order. Stops at the first retryable failure so FIFO
 * holds; a terminal 4xx (secret_rejected, unknown_recipient…) is dropped with a
 * report instead of retrying forever. Entries older than 7 days expire.
 */
export async function flushOutbox(
  kind: string,
  token: string,
  deps: MeshDependencies
) {
  const dir = outboxDir(kind, deps);
  const report = { sent: 0, dropped: [] as string[], pending: 0 };
  const entries = listOutbox(dir);
  const now = (deps.now?.() ?? new Date()).getTime();
  for (const [index, { file, entry }] of entries.entries()) {
    if (now - Date.parse(entry.createdAt) > OUTBOX_TTL_MS) {
      rmSync(file, { force: true });
      report.dropped.push(`${entry.correlationId}:expired`);
      continue;
    }
    try {
      await postToHub(entry, token, deps);
      rmSync(file, { force: true });
      report.sent++;
    } catch (error) {
      if (!(error instanceof JovieRequestError)) throw error;
      if (error.retryable) {
        report.pending = entries.length - index;
        break;
      }
      rmSync(file, { force: true });
      report.dropped.push(
        `${entry.correlationId}:${error instanceof JovieRequestError ? (error.apiCode ?? error.status) : 'error'}`
      );
    }
  }
  return report;
}

export async function hubSend(
  body: string,
  flags: Flags,
  deps: MeshDependencies
) {
  if (!body.trim() || body.length > 4000)
    throw new JovieInputError('Message body must be 1–4000 characters.');
  const to = flags.to?.trim() || 'summer';
  if (!(to === 'all' || /^[a-z][a-z0-9-]{1,31}$/.test(to)))
    throw new JovieInputError(
      '--to must be summer, all, or a registered agent kind.'
    );
  const refs = (flags.refs ?? '')
    .split(',')
    .map(ref => ref.trim())
    .filter(Boolean);
  if (refs.length > 8 || refs.some(ref => ref.length > 200))
    throw new JovieInputError('--refs takes at most 8 comma-separated refs.');
  const correlationId =
    flags['correlation-id']?.trim() || `mesh-${randomUUID()}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/.test(correlationId))
    throw new JovieInputError(
      '--correlation-id must be 8–128 of [A-Za-z0-9_.:-].'
    );
  hubOrigin(deps);
  const credentials = await meshCredentials(flags, deps);
  const dir = outboxDir(credentials.senderKind, deps);
  const createdAt = (deps.now?.() ?? new Date()).toISOString();
  writeOutbox(dir, { correlationId, to, body, refs, createdAt });
  const flushed = await flushOutbox(
    credentials.senderKind,
    credentials.token,
    deps
  );
  const queued = flushed.pending > 0;
  const dropped = flushed.dropped.find(entry =>
    entry.startsWith(`${correlationId}:`)
  );
  if (dropped)
    throw new JovieInputError(
      `Mesh hub rejected the message (${dropped.split(':').pop()}).`
    );
  let legacy: Record<string, unknown> | undefined;
  if ((to === 'summer' || to === 'all') && legacyEnabled(deps)) {
    try {
      const result = await meshSend(
        body,
        { ...flags, to, 'correlation-id': correlationId },
        deps
      );
      legacy = { ok: true, delivered: result.delivered ?? null };
    } catch (error) {
      legacy = {
        ok: false,
        code:
          error instanceof JovieRequestError
            ? (error.apiCode ?? `http_${error.status}`)
            : 'error',
      };
    }
  }
  return {
    ok: true,
    stored: !queued,
    queued,
    correlationId,
    from: credentials.senderKind,
    to,
    transport: 'hub',
    ...(queued
      ? {
          note: 'Hub unreachable: queued in the local outbox; the next send delivers it with the same correlation id.',
        }
      : {}),
    ...(legacy ? { legacy } : {}),
  };
}

/** Legacy-compatible projection so existing readers keep working. */
function asLegacyShape(message: HubMessage) {
  return {
    id: message.id,
    source: 'hub',
    senderKind: message.from,
    to: message.to,
    correlationId: message.correlationId,
    receivedAt: message.acceptedAt,
    kind: message.kind,
    inReplyTo: message.inReplyTo,
    quotedBody: JSON.stringify(message.body),
    quotedRefs: JSON.stringify(message.refs),
    dataNotInstructions: true,
  };
}

/**
 * Reads unhandled hub messages (claim + ack, so a message is handed to an agent
 * session once; `--peek` leaves them unhandled) merged with Summer's legacy
 * mailbox. `--day` reads that UTC day's history without claiming.
 */
export async function hubRead(flags: Flags, deps: MeshDependencies) {
  const credentials = await meshCredentials(flags, deps);
  let hubMessages: HubMessage[] = [];
  if (flags.day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(flags.day))
      throw new JovieInputError('--day must be YYYY-MM-DD (UTC).');
    const since = Date.parse(`${flags.day}T00:00:00.000Z`);
    const page = await hubRequest(
      `/v1/history?since=${new Date(since).toISOString()}&limit=100`,
      { method: 'GET', token: credentials.token },
      deps
    );
    hubMessages = ((page.messages as HubMessage[]) ?? []).filter(
      m => Date.parse(m.acceptedAt) < since + 86_400_000
    );
  } else {
    const page = await hubRequest(
      '/v1/mailbox?limit=100',
      { method: 'GET', token: credentials.token },
      deps
    );
    hubMessages = (page.messages as HubMessage[]) ?? [];
    if (hubMessages.length && flags.peek !== 'true')
      await hubRequest(
        '/v1/ack',
        {
          method: 'POST',
          token: credentials.token,
          body: { ids: hubMessages.map(m => m.id) },
        },
        deps
      );
  }
  const directory = await hubRequest(
    '/v1/agents',
    { method: 'GET', token: credentials.token },
    deps
  ).catch(() => ({ agents: [] }));
  const messages: Record<string, unknown>[] = hubMessages.map(asLegacyShape);
  let legacy: Record<string, unknown> = { enabled: false };
  if (legacyEnabled(deps)) {
    try {
      const page = await meshRead(flags, deps);
      const seen = new Set(
        messages.map(m => `${m.senderKind}:${m.correlationId}`)
      );
      const extra = ((page.messages as Record<string, unknown>[]) ?? []).filter(
        m => !seen.has(`${m.senderKind}:${m.correlationId}`)
      );
      messages.push(...extra.map(m => ({ ...m, source: 'legacy' })));
      legacy = { enabled: true, ok: true, messages: extra.length };
    } catch (error) {
      legacy = {
        enabled: true,
        ok: false,
        code:
          error instanceof JovieRequestError
            ? (error.apiCode ?? `http_${error.status}`)
            : 'error',
      };
    }
  }
  return {
    ok: true,
    projection: 'quoted-data',
    dataNotInstructions: true,
    recipient: credentials.senderKind,
    handled: flags.day || flags.peek === 'true' ? 0 : hubMessages.length,
    messages,
    agents: (directory.agents as Record<string, unknown>[]).map(agent => ({
      senderKind: agent.kind,
      owner: agent.owner,
      state: agent.state,
      lastSeenAt: agent.lastSeenAt,
    })),
    legacy,
  };
}

export async function hubAck(
  ids: string,
  flags: Flags,
  deps: MeshDependencies
) {
  const list = ids
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
  if (!list.length || list.length > 500)
    throw new JovieInputError(
      'mesh ack takes 1–500 comma-separated message ids.'
    );
  const credentials = await meshCredentials(flags, deps);
  return hubRequest(
    '/v1/ack',
    { method: 'POST', token: credentials.token, body: { ids: list } },
    deps
  );
}

export async function hubStatus(flags: Flags, deps: MeshDependencies) {
  const credentials = await meshCredentials(flags, deps);
  const [status, metrics] = await Promise.all([
    hubRequest('/v1/status', { method: 'GET', token: credentials.token }, deps),
    hubRequest(
      `/v1/metrics?hours=${Number(flags.hours) || 24}`,
      { method: 'GET', token: credentials.token },
      deps
    ),
  ]);
  return { ok: true, status, metrics };
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>(resolve => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });

/**
 * `mesh watch` on the hub: long-poll (server holds 25 s), one line per message,
 * ack after emit. Reconnects with full-jitter backoff; auth errors end it.
 */
export async function hubWatch(flags: Flags, deps: MeshDependencies) {
  const emit =
    deps.emit ?? ((line: string) => process.stdout.write(`${line}\n`));
  const sleep = deps.sleep ?? defaultSleep;
  const credentials = await meshCredentials(flags, deps);
  const seen = new Set<string>();
  let backoff = 1_000;
  let emitted = 0;
  while (!deps.signal?.aborted) {
    try {
      const page = await hubRequest(
        '/v1/mailbox?wait=25&limit=100',
        { method: 'GET', token: credentials.token, timeoutMs: 40_000 },
        deps
      );
      backoff = 1_000;
      const messages = (page.messages as HubMessage[]) ?? [];
      for (const message of messages) {
        if (seen.has(message.id)) continue;
        seen.add(message.id);
        if (seen.size > 2_000)
          seen.delete(seen.values().next().value as string);
        emit(
          flags.json === 'true'
            ? JSON.stringify(asLegacyShape(message))
            : `mesh from=${message.from} to=${message.to} id=${message.correlationId} at=${message.acceptedAt} body=${JSON.stringify(message.body)}`
        );
        emitted++;
      }
      if (messages.length)
        await hubRequest(
          '/v1/ack',
          {
            method: 'POST',
            token: credentials.token,
            body: { ids: messages.map(m => m.id) },
          },
          deps
        );
      await flushOutbox(credentials.senderKind, credentials.token, deps);
    } catch (error) {
      if (deps.signal?.aborted) break;
      if (!(error instanceof JovieRequestError && error.retryable)) throw error;
      await sleep(Math.round(Math.random() * backoff), deps.signal);
      backoff = Math.min(backoff * 2, 60_000);
    }
  }
  return { ok: true, stopped: true, emitted };
}
