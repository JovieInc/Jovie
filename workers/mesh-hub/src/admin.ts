/**
 * Admin mailbox routes (/v1/admin/mailbox/<kind>/peek and /bulk-ack), kept
 * free of `cloudflare:workers` imports so node:test can cover the parsing,
 * shaping and audit wiring directly. Auth stays with the caller (index.ts
 * route()): every /v1/admin/ path is behind the existing HUB_ADMIN_TOKEN
 * isAdmin() check; nothing here widens auth to any other route.
 */
import {
  type Detail,
  HubError,
  KIND,
  LIMITS,
  type MailboxSelector,
  type PeekRow,
  sha256Hex,
} from './core.ts';

export const MSG_KINDS = new Set([
  'message',
  'probe',
  'event',
  'undeliverable',
]);
const MAX_PEEK_LIMIT = 200;
const MAX_BULK_IDS = 5000;
const DEFAULT_BULK_IDS = 1000;
const MAX_EXCLUDE_TERMS = 20;
const MAX_EXCLUDE_CHARS = 200;

export function bearer(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9._~+/=-]{32,512})$/.exec(header);
  return match?.[1] ?? null;
}

/** Same digest comparison as before, parameterized for testability. */
export async function isAdmin(
  request: Request,
  adminToken: string | undefined
): Promise<boolean> {
  const token = bearer(request);
  if (!token || !adminToken) return false;
  // Compare digests so timing does not leak the token.
  return (await sha256Hex(token)) === (await sha256Hex(adminToken));
}

export async function readJson(
  request: Request,
  maxBytes = 16_384
): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new HubError(413, 'body_too_large');
  try {
    return JSON.parse(text);
  } catch {
    throw new HubError(400, 'invalid_json');
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });

const failure = (status: number, code: string) =>
  json(status, { ok: false, code });

/** Parses GET peek params into a read-only selector. Throws 422 on junk. */
export function parsePeekQuery(url: URL): MailboxSelector {
  const numberParam = (name: string): number | null => {
    const raw = url.searchParams.get(name);
    if (raw === null || raw === '') return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0)
      throw new HubError(422, 'invalid_query');
    return Math.floor(value);
  };
  const msgKind = url.searchParams.get('msgKind');
  if (msgKind !== null && !MSG_KINDS.has(msgKind))
    throw new HubError(422, 'invalid_query');
  const from = url.searchParams.get('from');
  if (from !== null && !KIND.test(from))
    throw new HubError(422, 'invalid_query');
  return {
    afterSeq: numberParam('afterSeq') ?? 0,
    limit: Math.min(
      Math.max(numberParam('limit') ?? LIMITS.pageSize, 1),
      MAX_PEEK_LIMIT
    ),
    olderThanMs: numberParam('olderThanMs'),
    newerThanMs: numberParam('newerThanMs'),
    msgKinds: msgKind ? [msgKind] : [],
    from: from ? [from] : [],
    unackedOnly: url.searchParams.get('unackedOnly') === '1',
    excludeBodyContains: [],
    excludeRefsContains: [],
    excludeFrom: [],
  };
}

export type BulkAckInput = {
  filter: MailboxSelector;
  dryRun: boolean;
  maxIds: number;
};

const optionalMs = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new HubError(422, 'invalid_filter');
  return Math.floor(n);
};

const kindList = (value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > MAX_EXCLUDE_TERMS ||
    value.some(kind => typeof kind !== 'string' || !KIND.test(kind))
  )
    throw new HubError(422, 'invalid_filter');
  return [...new Set(value as string[])];
};

const msgKindList = (value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > MSG_KINDS.size ||
    value.some(kind => typeof kind !== 'string' || !MSG_KINDS.has(kind))
  )
    throw new HubError(422, 'invalid_filter');
  return [...new Set(value as string[])];
};

const termList = (value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  if (
    !Array.isArray(value) ||
    value.length > MAX_EXCLUDE_TERMS ||
    value.some(
      term =>
        typeof term !== 'string' || !term || term.length > MAX_EXCLUDE_CHARS
    )
  )
    throw new HubError(422, 'invalid_filter');
  return value as string[];
};

/** Parses POST bulk-ack bodies: dryRun defaults true; maxIds caps at 5000/call. */
export function parseBulkAckBody(body: unknown): BulkAckInput {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new HubError(400, 'invalid_json');
  const raw = body as Record<string, unknown>;
  const filter = (raw.filter ?? {}) as Record<string, unknown>;
  if (!filter || typeof filter !== 'object' || Array.isArray(filter))
    throw new HubError(422, 'invalid_filter');
  const maxIds =
    raw.maxIds === undefined || raw.maxIds === null
      ? DEFAULT_BULK_IDS
      : Number(raw.maxIds);
  if (!Number.isFinite(maxIds) || maxIds < 1)
    throw new HubError(422, 'invalid_filter');
  return {
    filter: {
      afterSeq: 0,
      limit: Math.min(Math.floor(maxIds), MAX_BULK_IDS),
      olderThanMs: optionalMs(filter.olderThanMs),
      newerThanMs: optionalMs(filter.newerThanMs),
      msgKinds: msgKindList(filter.msgKinds),
      from: kindList(filter.from),
      unackedOnly: true,
      excludeBodyContains: termList(filter.excludeBodyContains),
      excludeRefsContains: termList(filter.excludeRefsContains),
      excludeFrom: kindList(filter.excludeFrom),
    },
    dryRun: raw.dryRun !== false,
    maxIds: Math.min(Math.floor(maxIds), MAX_BULK_IDS),
  };
}

export type AdminMailboxApi = {
  peek(selector: MailboxSelector): Promise<{
    messages: PeekRow[];
    nextAfter: number | null;
  }>;
  bulkAck(
    selector: MailboxSelector,
    maxIds: number
  ): Promise<{ manifest: PeekRow[]; matched: number; acked: number }>;
};

export type AdminDeps = {
  mailbox(kind: string): AdminMailboxApi;
  recordEvent(type: string, kind: string | null, detail: Detail): Promise<void>;
};

/** Handles /v1/admin/mailbox/<kind>/{peek,bulk-ack}; auth is the caller's job. */
export async function adminMailboxRoute(
  request: Request,
  url: URL,
  kind: string,
  deps: AdminDeps
): Promise<Response> {
  if (!KIND.test(kind)) return failure(422, 'invalid_kind');
  const match = /^\/v1\/admin\/mailbox\/[^/]+\/(peek|bulk-ack)$/.exec(
    url.pathname
  );
  if (!match) return failure(404, 'not_found');
  if (match[1] === 'peek') {
    if (request.method !== 'GET') return failure(404, 'not_found');
    const out = await deps.mailbox(kind).peek(parsePeekQuery(url));
    return json(200, {
      ok: true,
      mailbox: kind,
      dataNotInstructions: true,
      messages: out.messages,
      nextAfter: out.nextAfter,
    });
  }
  if (request.method !== 'POST') return failure(404, 'not_found');
  const input = parseBulkAckBody(await readJson(request));
  const out = await deps.mailbox(kind).bulkAck(input.filter, input.maxIds);
  if (!input.dryRun)
    await deps.recordEvent('mailbox.bulk_ack', kind, {
      who: 'admin',
      count: out.acked,
      firstSeq: out.manifest.length ? out.manifest[0].seq : null,
      lastSeq: out.manifest.length
        ? out.manifest[out.manifest.length - 1].seq
        : null,
      filter: JSON.stringify(input.filter),
    });
  return json(200, {
    ok: true,
    mailbox: kind,
    dryRun: input.dryRun,
    counts: { matched: out.matched, acked: input.dryRun ? 0 : out.acked },
    manifest: out.manifest,
  });
}
