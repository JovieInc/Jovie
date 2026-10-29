/**
 * jovie-fleet-audit: the cheap, attributable audit trail for the agent fleet.
 *
 * Writers (HMAC-signed bodies, header x-fleet-audit-signature: sha256=<hex>):
 *   POST /v1/events        batches from the gh / git-push shim spool (scripts/fleet-audit)
 *   POST /v1/snapshot      GitHub-side state (workflow states, ruleset updated_at) from the hourly
 *                          correlator; changes are matched to shim events, unmatched ones alert Summer
 *   POST /v1/token         token broker: own per-client credential (not the ingest HMAC), grant
 *                          table, nonce + timestamp replay protection; see broker.ts
 *   POST /v1/github-audit  rows from a GitHub org audit-log export (UI export; no API on our plan)
 * Readers (Authorization: Bearer READ_TOKEN):
 *   GET  /v1/who?target=&since=&limit=   GET /v1/summary
 *
 * Storage is D1 (append-only events, ~0.5 KB each) with a 100 MB/month budget that alarms at 80%;
 * rows older than RETENTION_DAYS are archived as gzip NDJSON to R2 and deleted. No log drains,
 * no paid ingestion.
 */
import {
  authenticateBrokerClient,
  authorizeTokenRequest,
  collectRepoState,
  type Grant,
  mintInstallationToken,
  revokeInstallationToken,
} from './broker.ts';

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
  readonly GITHUB_APP_ID?: string;
  readonly GITHUB_INSTALLATION_ID?: string;
  readonly GITHUB_APP_PRIVATE_KEY?: string;
  /** JSON {clientId: key}; per-client issuance keys, distinct from INGEST_HMAC_SECRET. */
  readonly BROKER_CLIENT_KEYS?: string;
  /** Comma-separated owner/repo list the hourly cron correlates (default JovieInc/Jovie). */
  readonly WATCH_REPOS?: string;
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
const MAX_SNAPSHOT_ITEMS = 500;
const COLLECTION_STALE_MS = 2 * 3_600_000;
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

/** Mesh delivery of one alert body; true only on a 2xx from Summer. */
async function deliverToSummer(
  env: Env,
  body: string,
  refs: string[]
): Promise<{ ok: boolean; error?: string }> {
  if (!env.MESH_TOKEN || !env.MESH_SENDER_ID || !env.MESH_SENDER_KIND)
    return { ok: false, error: 'mesh_not_configured' };
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
    return res.ok ? { ok: true } : { ok: false, error: `http_${res.status}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 120) : 'fetch_failed',
    };
  }
}

export const OUTBOX_MAX_ATTEMPTS = 12;

/** Statement that enqueues an alert; batch it with the state change it reports (atomic). */
export function outboxStatement(
  env: Env,
  text: string,
  refs: string[],
  nowIso: string
): D1PreparedStatement {
  return env.AUDIT_DB.prepare(
    `INSERT INTO alert_outbox (id, created_at, body, refs, attempts, next_attempt_at)
     VALUES (?1, ?2, ?3, ?4, 0, ?2)`
  ).bind(
    crypto.randomUUID(),
    nowIso,
    text.slice(0, 1800),
    JSON.stringify(refs.slice(0, 8))
  );
}

/**
 * Deliver due alerts. A failure keeps the row with attempts+1, last_error and exponential backoff
 * (1 min doubling, capped at 6 h); after OUTBOX_MAX_ATTEMPTS it stays undelivered and visible.
 */
export async function drainOutbox(
  env: Env,
  now: Date,
  limit = 20
): Promise<{ delivered: number; failed: number }> {
  const nowIso = now.toISOString();
  const { results } = await env.AUDIT_DB.prepare(
    `SELECT id, body, refs, attempts FROM alert_outbox
      WHERE delivered_at IS NULL AND attempts < ?1 AND next_attempt_at <= ?2
      ORDER BY created_at LIMIT ?3`
  )
    .bind(OUTBOX_MAX_ATTEMPTS, nowIso, limit)
    .all<{ id: string; body: string; refs: string; attempts: number }>();
  let delivered = 0;
  let failed = 0;
  for (const row of results ?? []) {
    const r = await deliverToSummer(
      env,
      row.body,
      JSON.parse(row.refs || '[]')
    );
    if (r.ok) {
      delivered++;
      await env.AUDIT_DB.prepare(
        'UPDATE alert_outbox SET delivered_at = ?2, attempts = attempts + 1 WHERE id = ?1'
      )
        .bind(row.id, nowIso)
        .run();
    } else {
      failed++;
      const backoff = Math.min(6 * 3_600_000, 60_000 * 2 ** row.attempts);
      await env.AUDIT_DB.prepare(
        'UPDATE alert_outbox SET attempts = attempts + 1, last_error = ?2, next_attempt_at = ?3 WHERE id = ?1'
      )
        .bind(
          row.id,
          r.error ?? 'failed',
          new Date(now.getTime() + backoff).toISOString()
        )
        .run();
    }
  }
  return { delivered, failed };
}

/** Enqueue then try to deliver now; a failed delivery is retried by the hourly cron. */
export async function alertSummer(
  env: Env,
  text: string,
  refs: string[] = []
): Promise<boolean> {
  const now = new Date();
  await outboxStatement(env, text, refs, now.toISOString()).run();
  const { delivered } = await drainOutbox(env, now);
  return delivered > 0;
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

export type ChangeKind = 'changed' | 'added' | 'removed';

const RULESET_ACTIONS = [
  'ruleset.edit',
  'graphql.updateRepositoryRuleset',
  'graphql.createRepositoryRuleset',
  'graphql.deleteRepositoryRuleset',
];

function candidateActions(
  it: SnapshotItem,
  value: string,
  kind: ChangeKind
): string[] {
  if (it.kind === 'ruleset') return RULESET_ACTIONS;
  if (kind !== 'changed')
    return ['git.push', 'git.push_force', 'api.PUT', 'api.DELETE'];
  return value === 'active'
    ? ['workflow.enable', 'api.PUT']
    : ['workflow.disable', 'api.PUT'];
}

/**
 * Unmatched changes alert Summer, except workflow files appearing or disappearing: those land
 * through merged commits, which git history already attributes, so they are recorded as
 * 'observed' rather than paged. Ruleset additions and removals always need a shim event.
 */
export function unmatchedStatus(
  it: SnapshotItem,
  kind: ChangeKind
): 'unattributed' | 'observed' {
  return it.kind === 'workflow' && kind !== 'changed'
    ? 'observed'
    : 'unattributed';
}

/** owner/name, lowercased, from "owner/name", a GitHub URL or an ssh remote; null if not exact. */
export function normRepo(r: string | null | undefined): string | null {
  if (!r) return null;
  const m =
    /^(?:https?:\/\/github\.com\/|git@github\.com:)?([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(
      r.trim()
    );
  return m ? m[1].toLowerCase() : null;
}

const API_PATH_RE =
  /^\/?repos\/([\w.-]+\/[\w.-]+)\/(actions\/workflows|rulesets)\/([^/]+)(?:\/(?:enable|disable))?$/i;

function exactKey(key: string, it: SnapshotItem): boolean {
  const k = key.trim().toLowerCase();
  const keys = [String(it.id), it.name, it.path, it.path?.split('/').pop()]
    .filter((x): x is string => Boolean(x))
    .map(x => x.toLowerCase());
  return keys.includes(k);
}

/**
 * Exact attribution only: the event must name the same repository (from its API path or its repo
 * field, normalized) and the same object (id, name, workflow path or file name). No substrings, and
 * an event without a resolvable repository never attributes.
 */
export function matchesTarget(
  ev: AuditEvent,
  it: SnapshotItem,
  repo: string
): boolean {
  const want = normRepo(repo);
  if (!want) return false;
  const t = (ev.target ?? '').trim();
  const m = API_PATH_RE.exec(t);
  if (m) {
    const pathKind = m[2].toLowerCase() === 'rulesets' ? 'ruleset' : 'workflow';
    return (
      m[1].toLowerCase() === want && pathKind === it.kind && exactKey(m[3], it)
    );
  }
  return normRepo(ev.repo) === want && exactKey(t, it);
}

async function findMatch(
  env: Env,
  repo: string,
  it: SnapshotItem,
  value: string,
  changedAt: string,
  kind: ChangeKind = 'changed'
) {
  const at = Date.parse(changedAt);
  const lo = new Date(at - MATCH_BEFORE_MS).toISOString();
  const hi = new Date(at + MATCH_AFTER_MS).toISOString();
  const actions = candidateActions(it, value, kind);
  // Only a mutation that succeeded explains a change: refused or failed attempts never attribute.
  const { results } = await env.AUDIT_DB.prepare(
    `SELECT * FROM events WHERE ts BETWEEN ?1 AND ?2 AND outcome = 'ok'
       AND action IN (${actions.map((_, i) => `?${i + 3}`).join(',')})
     ORDER BY ts DESC LIMIT 50`
  )
    .bind(lo, hi, ...actions)
    .all<AuditEvent>();
  return (results ?? []).find(ev => matchesTarget(ev, it, repo));
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
  // Never diff a partial set: a truncated snapshot would read as mass removals.
  if (items.length > MAX_SNAPSHOT_ITEMS)
    throw new Error(
      `snapshot for ${repo} has ${items.length} items (max ${MAX_SNAPSHOT_ITEMS})`
    );
  const prefix = `${repo}:`;
  const { results: prevRows } = await env.AUDIT_DB.prepare(
    'SELECT key, value FROM snapshots WHERE substr(key, 1, ?1) = ?2'
  )
    .bind(prefix.length, prefix)
    .all<{ key: string; value: string }>();
  const prevByKey = new Map((prevRows ?? []).map(r => [r.key, r.value]));
  // Explicit baseline marker: a repo whose first snapshot was empty still has a baseline, so later
  // additions are drift rather than silently becoming a new baseline.
  const hasBaseline = Boolean(
    await env.AUDIT_DB.prepare('SELECT 1 AS x FROM snapshots WHERE key = ?1')
      .bind(`baseline:${repo}`)
      .first()
  );

  const writes: D1PreparedStatement[] = [];
  const diffs: Array<{
    it: SnapshotItem;
    kind: ChangeKind;
    prev: string | null;
    value: string;
  }> = [];
  const seen = new Set<string>();
  for (const it of items) {
    const key = `${prefix}${it.kind}:${it.id}`;
    seen.add(key);
    const value = itemValue(it);
    const prev = prevByKey.get(key);
    if (prev !== value)
      writes.push(
        env.AUDIT_DB.prepare(
          `INSERT INTO snapshots (key, value, observed_at) VALUES (?1, ?2, ?3)
           ON CONFLICT(key) DO UPDATE SET value = ?2, observed_at = ?3`
        ).bind(key, value, nowIso)
      );
    if (prev === undefined) {
      if (hasBaseline) diffs.push({ it, kind: 'added', prev: null, value });
    } else if (prev !== value) {
      diffs.push({ it, kind: 'changed', prev, value });
    }
  }
  for (const [key, prev] of prevByKey) {
    if (seen.has(key)) continue;
    const [, kindName, id] =
      key.slice(prefix.length).match(/^(workflow|ruleset):(.+)$/) ?? [];
    if (!kindName) continue;
    writes.push(
      env.AUDIT_DB.prepare('DELETE FROM snapshots WHERE key = ?1').bind(key)
    );
    diffs.push({
      it: { kind: kindName as SnapshotItem['kind'], id },
      kind: 'removed',
      prev,
      value: '',
    });
  }
  if (!hasBaseline)
    writes.push(
      env.AUDIT_DB.prepare(
        'INSERT INTO snapshots (key, value, observed_at) VALUES (?1, ?2, ?2) ON CONFLICT(key) DO NOTHING'
      ).bind(`baseline:${repo}`, nowIso)
    );

  for (const { it, kind, prev, value } of diffs) {
    const changedAt = (kind !== 'removed' && it.updated_at) || nowIso;
    const change =
      kind === 'added'
        ? `added (${value || 'present'})`
        : kind === 'removed'
          ? `removed (was ${prev})`
          : it.kind === 'workflow'
            ? `${prev} -> ${value}`
            : `updated ${value}`;
    const target = it.name ?? String(it.id);
    const match = await findMatch(env, repo, it, value, changedAt, kind);
    const status = match ? 'attributed' : unmatchedStatus(it, kind);
    const correlationId = crypto.randomUUID();
    writes.push(
      env.AUDIT_DB.prepare(
        `INSERT INTO correlations (id, observed_at, changed_at, repo, target, change, github_actor, matched_event_id, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
      ).bind(
        correlationId,
        nowIso,
        changedAt,
        repo,
        target,
        `${it.kind} ${change}`,
        githubActor,
        match?.id ?? null,
        status
      )
    );
    if (status === 'unattributed')
      writes.push(
        outboxStatement(
          env,
          `[fleet-audit] UNATTRIBUTED change: ${it.kind} "${target}" in ${repo} ${change} at ${changedAt}. ` +
            'No shim event explains it: an agent bypassed the gh shim, a human clicked it, or a GitHub App ' +
            'did it. Check the org audit log export and fix the gap.',
          [correlationId],
          nowIso
        )
      );
    out.push({
      target,
      change: `${it.kind} ${change}`,
      status,
      matched_event_id: match?.id ?? null,
    });
  }
  // One D1 batch = one transaction: snapshot state, correlations and their alerts land together or not at all.
  if (writes.length) await env.AUDIT_DB.batch(writes);
  if (out.some(o => o.status === 'unattributed'))
    await drainOutbox(env, new Date(nowIso));
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
  await env.AUDIT_DB.prepare(
    'DELETE FROM alert_outbox WHERE delivered_at IS NOT NULL AND delivered_at < ?1'
  )
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
    alerts_pending:
      (
        await env.AUDIT_DB.prepare(
          'SELECT COUNT(*) AS n FROM alert_outbox WHERE delivered_at IS NULL'
        ).first<{ n: number }>()
      )?.n ?? 0,
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
      // last_collection_ok_at is the registry receipt: it only advances on a successful collection.
      return json({
        ok: true,
        last_cron_at: last?.value ?? null,
        ...(await collectionHealth(env, now)),
      });
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

  // Token issuance never accepts the ingest signature: it has its own per-client credential.
  if (url.pathname === '/v1/token') return issueToken(request, env, now);

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
    if (body.items.length > MAX_SNAPSHOT_ITEMS)
      return json(
        { error: `at most ${MAX_SNAPSHOT_ITEMS} items per snapshot` },
        400
      );
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

const MAX_TOKEN_BODY = 4096;

export async function issueToken(
  request: Request,
  env: Env,
  now: Date
): Promise<Response> {
  if (
    !env.GITHUB_APP_PRIVATE_KEY ||
    !env.GITHUB_APP_ID ||
    !env.GITHUB_INSTALLATION_ID ||
    !env.BROKER_CLIENT_KEYS
  )
    return json({ error: 'broker_not_configured' }, 503);
  const body = await request.text();
  if (body.length > MAX_TOKEN_BODY)
    return json({ error: 'payload too large' }, 413);
  const auth = await authenticateBrokerClient({
    headers: request.headers,
    body,
    clientKeysJson: env.BROKER_CLIENT_KEYS,
    ingestSecret: env.INGEST_HMAC_SECRET,
    nowSec: Math.floor(now.getTime() / 1000),
  });
  if ('error' in auth) return json({ error: auth.error }, auth.status);

  const grant = await env.AUDIT_DB.prepare(
    'SELECT client_id, agent_class, repos, scopes, active FROM broker_grants WHERE client_id = ?1'
  )
    .bind(auth.clientId)
    .first<Grant>();
  if (!grant || !grant.active)
    return json({ error: 'no active grant for this client' }, 403);

  // Replay protection: each (client, nonce) is accepted once inside the timestamp window.
  const seen = await env.AUDIT_DB.prepare(
    'INSERT OR IGNORE INTO broker_nonces (client_id, nonce, seen_at) VALUES (?1, ?2, ?3)'
  )
    .bind(auth.clientId, auth.nonce, now.toISOString())
    .run();
  if ((seen.meta?.changes ?? 0) === 0)
    return json({ error: 'replayed request' }, 409);

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const req = authorizeTokenRequest(parsed, grant);
  if (typeof req === 'string') return json({ error: req }, 403);

  let minted: Awaited<ReturnType<typeof mintInstallationToken>>;
  try {
    minted = await mintInstallationToken({
      appId: env.GITHUB_APP_ID,
      installationId: env.GITHUB_INSTALLATION_ID,
      privateKey: env.GITHUB_APP_PRIVATE_KEY,
      request: req,
    });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'mint failed' },
      502
    );
  }
  const nowIso = now.toISOString();
  // Fail closed: a token whose issuance is not on the audit trail is revoked and never returned.
  try {
    const audited = await insertEvents(
      env,
      [
        {
          id: crypto.randomUUID(),
          ts: nowIso,
          actor_agent: req.agent,
          session_id: req.session ?? null,
          host: req.host ?? null,
          repo: `JovieInc/${(req.repositories ?? []).join(',')}`,
          target: `client:${auth.clientId} scope:${req.scope}`,
          action: 'token.issue',
          danger: req.scope === 'ci' ? 1 : 0,
          reason: req.reason,
          issue: req.issue ?? null,
          outcome: 'ok',
          before: null,
          after: `expires ${minted.expires_at}`,
          source: 'broker',
        },
      ],
      nowIso
    );
    if (audited.inserted !== 1) throw new Error('issuance event not recorded');
  } catch {
    await revokeInstallationToken(minted.token);
    return json({ error: 'audit_unavailable' }, 503);
  }
  return json({
    ok: true,
    token: minted.token,
    expires_at: minted.expires_at,
    permissions: minted.permissions,
  });
}

/**
 * Hourly: read workflow states and ruleset versions for each watched repo with a read-only
 * jovie-bot token, then diff and attribute them (applySnapshot). Replaces a GitHub cron, which
 * repository policy forbids. No-op until the App key is bound.
 */
export async function correlateWatchedRepos(
  env: Env,
  now: Date,
  fetchImpl: typeof fetch = fetch
) {
  if (
    !env.GITHUB_APP_PRIVATE_KEY ||
    !env.GITHUB_APP_ID ||
    !env.GITHUB_INSTALLATION_ID
  )
    return [];
  const out: Array<{
    repo: string;
    items: number;
    changes: number;
    error?: string;
  }> = [];
  for (const repo of watchedRepos(env)) {
    try {
      const { token } = await mintInstallationToken({
        appId: env.GITHUB_APP_ID,
        installationId: env.GITHUB_INSTALLATION_ID,
        privateKey: env.GITHUB_APP_PRIVATE_KEY,
        request: {
          agent: 'fleet-audit-cron',
          scope: 'watch',
          repositories: [repo.split('/')[1]],
          reason: 'hourly correlation',
        },
        fetchImpl,
      });
      const items = await collectRepoState(repo, token, fetchImpl);
      const changes = await applySnapshot(
        env,
        repo,
        items,
        now.toISOString(),
        'cron'
      );
      out.push({ repo, items: items.length, changes: changes.length });
      // Freshness advances only after a complete collection and diff succeeded.
      await putMeta(env, `collect:${repo}:ok`, now.toISOString());
      await env.AUDIT_DB.prepare('DELETE FROM snapshots WHERE key = ?1')
        .bind(`collect:${repo}:error`)
        .run();
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      out.push({ repo, items: 0, changes: 0, error });
      const already = await env.AUDIT_DB.prepare(
        'SELECT value FROM snapshots WHERE key = ?1'
      )
        .bind(`collect:${repo}:error`)
        .first<{ value: string }>();
      await putMeta(
        env,
        `collect:${repo}:error`,
        `${now.toISOString()} ${error.slice(0, 200)}`
      );
      if (!already)
        await alertSummer(
          env,
          `[fleet-audit] correlation FAILED for ${repo} at ${now.toISOString()}: ${error.slice(0, 300)}. ` +
            'Drift detection for this repo is stale until a collection succeeds.'
        );
    }
  }
  return out;
}

async function putMeta(env: Env, key: string, value: string) {
  await env.AUDIT_DB.prepare(
    `INSERT INTO snapshots (key, value, observed_at) VALUES (?1, ?2, ?2)
     ON CONFLICT(key) DO UPDATE SET value = ?2, observed_at = ?2`
  )
    .bind(key, value)
    .run();
}

function watchedRepos(env: Env): string[] {
  return (env.WATCH_REPOS ?? 'JovieInc/Jovie')
    .split(',')
    .map(r => r.trim())
    .filter(Boolean);
}

/**
 * Collection freshness for the liveness receipt: the oldest last-successful collection across
 * watched repos (null until every repo has succeeded once), plus any repo whose latest attempt failed.
 */
export async function collectionHealth(env: Env, now: Date) {
  let oldest: string | null = null;
  let missing = false;
  const errors: Array<{ repo: string; error: string }> = [];
  for (const repo of watchedRepos(env)) {
    const ok = await env.AUDIT_DB.prepare(
      'SELECT value FROM snapshots WHERE key = ?1'
    )
      .bind(`collect:${repo}:ok`)
      .first<{ value: string }>();
    const err = await env.AUDIT_DB.prepare(
      'SELECT value FROM snapshots WHERE key = ?1'
    )
      .bind(`collect:${repo}:error`)
      .first<{ value: string }>();
    if (err) errors.push({ repo, error: err.value });
    if (!ok) missing = true;
    else if (!oldest || ok.value < oldest) oldest = ok.value;
  }
  const last = missing ? null : oldest;
  const stale =
    !last ||
    errors.length > 0 ||
    now.getTime() - Date.parse(last) > COLLECTION_STALE_MS;
  return {
    last_collection_ok_at: last,
    collection_stale: stale,
    collection_errors: errors,
  };
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
    await correlateWatchedRepos(env, now);
    await drainOutbox(env, now);
    await env.AUDIT_DB.prepare('DELETE FROM broker_nonces WHERE seen_at < ?1')
      .bind(new Date(now.getTime() - 3_600_000).toISOString())
      .run();
    if (now.getUTCHours() === 3) await retain(env, now);
  },
};
