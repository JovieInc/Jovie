/**
 * jovie-fleet-audit: the cheap, attributable audit trail for the agent fleet.
 *
 * Writers (HMAC-signed bodies, header x-fleet-audit-signature: sha256=<hex>):
 *   POST /v1/events        batches from the gh / git-push shim spool (scripts/fleet-audit)
 *   POST /v1/snapshot      GitHub-side state (workflow states, ruleset updated_at) from the hourly
 *                          correlator; changes are matched to shim events, unmatched ones alert Summer
 *   POST /v1/github-audit  rows from a GitHub org audit-log export (UI export; no API on our plan)
 * Readers (Authorization: Bearer READ_TOKEN):
 *   GET  /v1/who?target=&since=&limit=   GET /v1/summary
 *
 * Storage is D1 (append-only events, ~0.5 KB each) with a 100 MB/month budget that alarms at 80%;
 * rows older than RETENTION_DAYS are archived as gzip NDJSON to R2 and deleted. No log drains,
 * no paid ingestion.
 */
export interface Env {
  readonly AUDIT_DB: D1Database;
  readonly ARCHIVE?: R2Bucket;
  readonly INGEST_HMAC_SECRET: string;
  readonly READ_TOKEN: string;
  readonly BUDGET_BYTES_MONTH?: string;
  readonly RETENTION_DAYS?: string;
  readonly MESH_URL?: string;
  readonly MESH_SENDER_ID?: string;
  readonly MESH_SENDER_KIND?: string;
  readonly MESH_TOKEN?: string;
}

export interface AuditEvent {
  id: string;
  ts: string;
  actor_agent: string | null;
  session_id: string | null;
  host: string | null;
  repo: string | null;
  target: string | null;
  action: string;
  danger: 0 | 1;
  reason: string | null;
  issue: string | null;
  outcome: string | null;
  before: string | null;
  after: string | null;
  source: string | null;
}

const MAX_BODY = 512 * 1024;
const MAX_BATCH = 500;
const DEFAULT_BUDGET = 100 * 1024 * 1024;
const MATCH_BEFORE_MS = 30 * 60_000;
const MATCH_AFTER_MS = 10 * 60_000;
const FIELDS: Array<[keyof AuditEvent, number]> = [
  ['actor_agent', 80],
  ['session_id', 80],
  ['host', 60],
  ['repo', 120],
  ['target', 300],
  ['reason', 300],
  ['issue', 120],
  ['outcome', 40],
  ['before', 120],
  ['after', 120],
  ['source', 20],
];

function str(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}

export function sanitizeEvent(input: unknown): AuditEvent | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  const id = str(r.id, 64);
  const action = str(r.action, 80);
  const ts = str(r.ts, 40);
  if (
    !id ||
    !/^[\w-]{8,64}$/.test(id) ||
    !action ||
    !ts ||
    Number.isNaN(Date.parse(ts))
  )
    return null;
  const ev = {
    id,
    ts: new Date(ts).toISOString(),
    action,
    danger: r.danger ? 1 : 0,
  } as AuditEvent;
  for (const [k, max] of FIELDS)
    (ev as unknown as Record<string, unknown>)[k] = str(r[k], max);
  return ev;
}

export function eventBytes(ev: AuditEvent): number {
  return new TextEncoder().encode(JSON.stringify(ev)).length;
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(body)
  );
  return [...new Uint8Array(sig)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySignature(
  body: string,
  header: string | null,
  secret: string
) {
  if (!header || !secret) return false;
  return timingSafeEqual(header, `sha256=${await hmacHex(secret, body)}`);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

// ---------------------------------------------------------------- writes

export async function insertEvents(
  env: Env,
  events: AuditEvent[],
  nowIso: string
) {
  if (events.length === 0) return { inserted: 0, bytes: 0 };
  const stmt = env.AUDIT_DB.prepare(
    `INSERT OR IGNORE INTO events (id, ts, actor_agent, session_id, host, repo, target, action, danger,
       reason, issue, outcome, before, after, source, bytes, received_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`
  );
  let bytes = 0;
  const batch = events.map(ev => {
    const b = eventBytes(ev);
    bytes += b;
    return stmt.bind(
      ev.id,
      ev.ts,
      ev.actor_agent,
      ev.session_id,
      ev.host,
      ev.repo,
      ev.target,
      ev.action,
      ev.danger,
      ev.reason,
      ev.issue,
      ev.outcome,
      ev.before,
      ev.after,
      ev.source,
      b,
      nowIso
    );
  });
  const results = await env.AUDIT_DB.batch(batch);
  const inserted = results.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
  await env.AUDIT_DB.prepare(
    `INSERT INTO usage (month, bytes, events) VALUES (?1, ?2, ?3)
     ON CONFLICT(month) DO UPDATE SET bytes = bytes + ?2, events = events + ?3`
  )
    .bind(monthOf(nowIso), bytes, inserted)
    .run();
  return { inserted, bytes };
}

export async function alertSummer(
  env: Env,
  text: string,
  refs: string[] = []
): Promise<boolean> {
  if (!env.MESH_TOKEN || !env.MESH_SENDER_ID || !env.MESH_SENDER_KIND)
    return false;
  const body = text.slice(0, 1800);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(body)
  );
  const sha256 = [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  try {
    const res = await fetch(
      `${env.MESH_URL ?? 'https://summer.jov.ie'}/summer/v1/mesh/inbox`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.MESH_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          senderId: env.MESH_SENDER_ID,
          senderKind: env.MESH_SENDER_KIND,
          correlationId: `fleet-audit-${crypto.randomUUID()}`,
          sha256,
          body,
          refs: refs.slice(0, 8),
          timestamp: new Date().toISOString(),
          to: 'summer',
        }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

function describe(ev: AuditEvent): string {
  return (
    `[fleet-audit] DANGEROUS ${ev.action} on ${ev.repo ?? '?'} ${ev.target ?? ''} by ` +
    `${ev.actor_agent ?? '?'} on ${ev.host ?? '?'} (session ${ev.session_id ?? '?'}) at ${ev.ts}. ` +
    `Reason: ${ev.reason ?? 'none'}. Issue: ${ev.issue ?? 'none'}. Outcome: ${ev.outcome ?? '?'}.`
  );
}

export async function checkBudget(
  env: Env,
  nowIso: string
): Promise<{ pct: number; alarmed: boolean }> {
  const limit = Number(env.BUDGET_BYTES_MONTH ?? DEFAULT_BUDGET);
  const row = await env.AUDIT_DB.prepare(
    'SELECT bytes, alarmed FROM usage WHERE month = ?1'
  )
    .bind(monthOf(nowIso))
    .first<{ bytes: number; alarmed: number }>();
  const pct = row ? row.bytes / limit : 0;
  if (row && pct >= 0.8 && !row.alarmed) {
    await env.AUDIT_DB.prepare('UPDATE usage SET alarmed = 1 WHERE month = ?1')
      .bind(monthOf(nowIso))
      .run();
    await alertSummer(
      env,
      `[fleet-audit] budget alarm: ${(row.bytes / 1048576).toFixed(1)} MB of ${(limit / 1048576).toFixed(0)} MB ` +
        `used this month (${Math.round(pct * 100)}%). Find the noisy actor with GET /v1/summary; do not raise ` +
        'the budget without Tim.'
    );
    return { pct, alarmed: true };
  }
  return { pct, alarmed: false };
}

// ---------------------------------------------------------------- correlation

export interface SnapshotItem {
  kind: 'workflow' | 'ruleset';
  id: string | number;
  name?: string;
  path?: string;
  state?: string;
  updated_at?: string;
}

function itemValue(it: SnapshotItem): string {
  return it.kind === 'workflow'
    ? String(it.state ?? '')
    : String(it.updated_at ?? '');
}

function candidateActions(it: SnapshotItem, value: string): string[] {
  if (it.kind === 'workflow') {
    return value === 'active'
      ? ['workflow.enable', 'api.PUT']
      : ['workflow.disable', 'api.PUT'];
  }
  return [
    'ruleset.edit',
    'graphql.updateRepositoryRuleset',
    'graphql.createRepositoryRuleset',
    'graphql.deleteRepositoryRuleset',
  ];
}

export function matchesTarget(ev: AuditEvent, it: SnapshotItem): boolean {
  const t = (ev.target ?? '').toLowerCase();
  if (!t) return false;
  const keys = [String(it.id), it.name, it.path, it.path?.split('/').pop()]
    .filter((k): k is string => Boolean(k))
    .map(k => k.toLowerCase());
  return keys.some(
    k => t === k || t.includes(`/${k}/`) || t.endsWith(`/${k}`) || t.includes(k)
  );
}

async function findMatch(
  env: Env,
  repo: string,
  it: SnapshotItem,
  value: string,
  changedAt: string
) {
  const at = Date.parse(changedAt);
  const lo = new Date(at - MATCH_BEFORE_MS).toISOString();
  const hi = new Date(at + MATCH_AFTER_MS).toISOString();
  const actions = candidateActions(it, value);
  const { results } = await env.AUDIT_DB.prepare(
    `SELECT * FROM events WHERE ts BETWEEN ?1 AND ?2 AND action IN (${actions.map((_, i) => `?${i + 3}`).join(',')})
     ORDER BY ts DESC LIMIT 50`
  )
    .bind(lo, hi, ...actions)
    .all<AuditEvent>();
  const repoName = repo.split('/').pop()?.toLowerCase() ?? '';
  return (results ?? []).find(
    ev =>
      matchesTarget(ev, it) &&
      (!ev.repo ||
        ev.repo.toLowerCase().includes(repoName) ||
        ev.repo === 'origin')
  );
}

export async function applySnapshot(
  env: Env,
  repo: string,
  items: SnapshotItem[],
  nowIso: string,
  githubActor: string | null
) {
  const out: Array<{
    target: string;
    change: string;
    status: string;
    matched_event_id: string | null;
  }> = [];
  for (const it of items.slice(0, 500)) {
    const key = `${repo}:${it.kind}:${it.id}`;
    const value = itemValue(it);
    const prev = await env.AUDIT_DB.prepare(
      'SELECT value FROM snapshots WHERE key = ?1'
    )
      .bind(key)
      .first<{ value: string }>();
    await env.AUDIT_DB.prepare(
      `INSERT INTO snapshots (key, value, observed_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET value = ?2, observed_at = ?3`
    )
      .bind(key, value, nowIso)
      .run();
    if (!prev || prev.value === value) continue; // first sighting is a baseline, not a change
    const changedAt = it.updated_at ?? nowIso;
    const change =
      it.kind === 'workflow' ? `${prev.value} -> ${value}` : `updated ${value}`;
    const target = it.name ?? String(it.id);
    const match = await findMatch(env, repo, it, value, changedAt);
    const status = match ? 'attributed' : 'unattributed';
    await env.AUDIT_DB.prepare(
      `INSERT INTO correlations (id, observed_at, changed_at, repo, target, change, github_actor, matched_event_id, status)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    )
      .bind(
        crypto.randomUUID(),
        nowIso,
        changedAt,
        repo,
        target,
        `${it.kind} ${change}`,
        githubActor,
        match?.id ?? null,
        status
      )
      .run();
    out.push({
      target,
      change: `${it.kind} ${change}`,
      status,
      matched_event_id: match?.id ?? null,
    });
    if (!match) {
      await alertSummer(
        env,
        `[fleet-audit] UNATTRIBUTED change: ${it.kind} "${target}" in ${repo} ${change} at ${changedAt}. ` +
          'No shim event explains it: an agent bypassed the gh shim, a human clicked it, or a GitHub App ' +
          'did it. Check the org audit log export and fix the gap.'
      );
    }
  }
  return out;
}

interface GithubAuditRow {
  action?: string;
  actor?: string;
  created_at?: number | string;
  '@timestamp'?: number | string;
  repo?: string;
  workflow_id?: number | string;
  name?: string;
}

export async function applyGithubAudit(
  env: Env,
  rows: GithubAuditRow[],
  nowIso: string
) {
  let attributed = 0;
  let unattributed = 0;
  for (const r of rows.slice(0, 2000)) {
    const action = String(r.action ?? '');
    if (
      !/^(workflows\.|repository_ruleset\.|protected_branch\.|org\.update_actions_secret|repo\.remove_actions_secret)/.test(
        action
      )
    )
      continue;
    const raw = r.created_at ?? r['@timestamp'];
    const at =
      typeof raw === 'number'
        ? new Date(raw).toISOString()
        : new Date(String(raw)).toISOString();
    const repo = String(r.repo ?? '');
    const it: SnapshotItem = {
      kind: action.startsWith('workflows.') ? 'workflow' : 'ruleset',
      id: String(r.workflow_id ?? r.name ?? ''),
      name: r.name,
      state: action.includes('disable') ? 'disabled_manually' : 'active',
      updated_at: at,
    };
    const match = await findMatch(env, repo, it, it.state ?? '', at);
    const exists = await env.AUDIT_DB.prepare(
      'SELECT 1 FROM correlations WHERE changed_at = ?1 AND change = ?2 AND repo = ?3'
    )
      .bind(at, `github ${action}`, repo)
      .first();
    if (exists) continue;
    await env.AUDIT_DB.prepare(
      `INSERT INTO correlations (id, observed_at, changed_at, repo, target, change, github_actor, matched_event_id, status)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    )
      .bind(
        crypto.randomUUID(),
        nowIso,
        at,
        repo,
        it.name ?? String(it.id),
        `github ${action}`,
        r.actor ?? null,
        match?.id ?? null,
        match ? 'attributed' : 'unattributed'
      )
      .run();
    if (match) attributed++;
    else unattributed++;
  }
  return { attributed, unattributed };
}

// ---------------------------------------------------------------- retention

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function retain(env: Env, now: Date) {
  const days = Number(env.RETENTION_DAYS ?? 90);
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
  const { results } = await env.AUDIT_DB.prepare(
    'SELECT * FROM events WHERE ts < ?1 ORDER BY ts LIMIT 20000'
  )
    .bind(cutoff)
    .all<AuditEvent>();
  if (!results?.length) return { archived: 0 };
  if (!env.ARCHIVE) return { archived: 0 }; // never delete what we could not archive
  const ndjson = results.map(r => JSON.stringify(r)).join('\n') + '\n';
  const key = `fleet-audit/archive/${now.toISOString().slice(0, 10)}-${results.length}.ndjson.gz`;
  await env.ARCHIVE.put(key, await gzip(ndjson), {
    httpMetadata: {
      contentType: 'application/x-ndjson',
      contentEncoding: 'gzip',
    },
  });
  const last = results[results.length - 1].ts;
  await env.AUDIT_DB.prepare('DELETE FROM events WHERE ts <= ?1 AND ts < ?2')
    .bind(last, cutoff)
    .run();
  await env.AUDIT_DB.prepare('DELETE FROM correlations WHERE observed_at < ?1')
    .bind(cutoff)
    .run();
  return { archived: results.length, key };
}

// ---------------------------------------------------------------- reads

function authorizedReader(request: Request, env: Env): boolean {
  const h = request.headers.get('authorization') ?? '';
  return (
    Boolean(env.READ_TOKEN) && timingSafeEqual(h, `Bearer ${env.READ_TOKEN}`)
  );
}

function parseSince(v: string | null, now: Date): string {
  if (!v) return new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const rel = /^(\d+)([hd])$/.exec(v);
  if (rel)
    return new Date(
      now.getTime() - Number(rel[1]) * (rel[2] === 'h' ? 3_600_000 : 86_400_000)
    ).toISOString();
  const t = Date.parse(v);
  return Number.isNaN(t)
    ? new Date(now.getTime() - 30 * 86_400_000).toISOString()
    : new Date(t).toISOString();
}

export async function who(
  env: Env,
  target: string,
  since: string,
  limit: number
) {
  const like = `%${target.replace(/[%_]/g, m => `\\${m}`)}%`;
  const events = await env.AUDIT_DB.prepare(
    `SELECT id, ts, actor_agent, session_id, host, repo, target, action, danger, reason, issue, outcome,
            before, after, source
       FROM events
      WHERE ts >= ?1 AND (target LIKE ?2 ESCAPE '\\' OR repo LIKE ?2 ESCAPE '\\' OR actor_agent LIKE ?2 ESCAPE '\\')
      ORDER BY ts DESC LIMIT ?3`
  )
    .bind(since, like, limit)
    .all();
  const correlations = await env.AUDIT_DB.prepare(
    `SELECT id, observed_at, changed_at, repo, target, change, github_actor, matched_event_id, status
       FROM correlations WHERE observed_at >= ?1 AND (target LIKE ?2 ESCAPE '\\' OR repo LIKE ?2 ESCAPE '\\')
      ORDER BY observed_at DESC LIMIT ?3`
  )
    .bind(since, like, limit)
    .all();
  return {
    events: events.results ?? [],
    correlations: correlations.results ?? [],
  };
}

export async function summary(env: Env, now: Date) {
  const nowIso = now.toISOString();
  const week = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const day = new Date(now.getTime() - 86_400_000).toISOString();
  const limit = Number(env.BUDGET_BYTES_MONTH ?? DEFAULT_BUDGET);
  const usage = await env.AUDIT_DB.prepare(
    'SELECT bytes FROM usage WHERE month = ?1'
  )
    .bind(monthOf(nowIso))
    .first<{ bytes: number }>();
  const dangerous = await env.AUDIT_DB.prepare(
    'SELECT * FROM events WHERE danger = 1 AND ts >= ?1 ORDER BY ts DESC LIMIT 50'
  )
    .bind(week)
    .all();
  const unattributed = await env.AUDIT_DB.prepare(
    "SELECT * FROM correlations WHERE status = 'unattributed' AND observed_at >= ?1 ORDER BY observed_at DESC LIMIT 50"
  )
    .bind(week)
    .all();
  const c24 = await env.AUDIT_DB.prepare(
    'SELECT COUNT(*) AS n FROM events WHERE ts >= ?1'
  )
    .bind(day)
    .first<{ n: number }>();
  const c7 = await env.AUDIT_DB.prepare(
    'SELECT COUNT(*) AS n FROM events WHERE ts >= ?1'
  )
    .bind(week)
    .first<{ n: number }>();
  const top = await env.AUDIT_DB.prepare(
    'SELECT actor_agent, COUNT(*) AS n FROM events WHERE ts >= ?1 GROUP BY actor_agent ORDER BY n DESC LIMIT 10'
  )
    .bind(day)
    .all();
  const bytes = usage?.bytes ?? 0;
  return {
    budget: {
      bytes_month: bytes,
      limit_bytes: limit,
      pct: Math.round((bytes / limit) * 1000) / 10,
    },
    dangerous: dangerous.results ?? [],
    unattributed: unattributed.results ?? [],
    counts: { events_24h: c24?.n ?? 0, events_7d: c7?.n ?? 0 },
    top_actors_24h: top.results ?? [],
  };
}

// ---------------------------------------------------------------- handler

async function readSigned(
  request: Request,
  env: Env
): Promise<unknown | Response> {
  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > MAX_BODY) return json({ error: 'payload too large' }, 413);
  const body = await request.text();
  if (body.length > MAX_BODY) return json({ error: 'payload too large' }, 413);
  if (
    !(await verifySignature(
      body,
      request.headers.get('x-fleet-audit-signature'),
      env.INGEST_HMAC_SECRET
    ))
  )
    return json({ error: 'invalid signature' }, 401);
  try {
    return JSON.parse(body);
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
}

export async function handle(
  request: Request,
  env: Env,
  now = new Date()
): Promise<Response> {
  const url = new URL(request.url);
  const nowIso = now.toISOString();

  if (request.method === 'GET') {
    if (url.pathname === '/healthz') {
      // Liveness receipt for canon/automation-registry.jsonl (worker:fleet-audit:cron).
      const last = await env.AUDIT_DB.prepare(
        "SELECT value FROM snapshots WHERE key = 'cron:last'"
      ).first<{ value: string }>();
      return json({ ok: true, last_cron_at: last?.value ?? null });
    }
    if (!authorizedReader(request, env))
      return json({ error: 'unauthorized' }, 401);
    if (url.pathname === '/v1/who') {
      const target = (url.searchParams.get('target') ?? '').trim();
      if (target.length < 2) return json({ error: 'target is required' }, 400);
      const limit = Math.min(
        200,
        Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50)
      );
      return json({
        ok: true,
        ...(await who(
          env,
          target.slice(0, 200),
          parseSince(url.searchParams.get('since'), now),
          limit
        )),
      });
    }
    if (url.pathname === '/v1/summary')
      return json({ ok: true, ...(await summary(env, now)) });
    return json({ error: 'not found' }, 404);
  }
  if (request.method !== 'POST')
    return json({ error: 'method not allowed' }, 405);

  const parsed = await readSigned(request, env);
  if (parsed instanceof Response) return parsed;

  if (url.pathname === '/v1/events') {
    if (!Array.isArray(parsed) || parsed.length > MAX_BATCH)
      return json(
        { error: `body must be an array of <= ${MAX_BATCH} events` },
        400
      );
    const events = parsed
      .map(sanitizeEvent)
      .filter((e): e is AuditEvent => e !== null);
    const res = await insertEvents(env, events, nowIso);
    for (const ev of events.filter(e => e.danger === 1))
      await alertSummer(env, describe(ev), [ev.id]);
    await checkBudget(env, nowIso);
    return json(
      { ok: true, received: parsed.length, accepted: events.length, ...res },
      202
    );
  }
  if (url.pathname === '/v1/snapshot') {
    const body = parsed as {
      repo?: string;
      items?: SnapshotItem[];
      github_actor?: string;
    };
    if (!body?.repo || !Array.isArray(body.items))
      return json({ error: 'repo and items are required' }, 400);
    const changes = await applySnapshot(
      env,
      body.repo,
      body.items,
      nowIso,
      body.github_actor ?? null
    );
    return json({ ok: true, changes });
  }
  if (url.pathname === '/v1/github-audit') {
    if (!Array.isArray(parsed))
      return json({ error: 'body must be an array' }, 400);
    return json({
      ok: true,
      ...(await applyGithubAudit(env, parsed as GithubAuditRow[], nowIso)),
    });
  }
  return json({ error: 'not found' }, 404);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const now = new Date(controller.scheduledTime);
    await checkBudget(env, now.toISOString());
    await env.AUDIT_DB.prepare(
      `INSERT INTO snapshots (key, value, observed_at) VALUES ('cron:last', ?1, ?1)
       ON CONFLICT(key) DO UPDATE SET value = ?1, observed_at = ?1`
    )
      .bind(now.toISOString())
      .run();
    if (now.getUTCHours() === 3) await retain(env, now);
  },
};
