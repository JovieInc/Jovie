import {
  displayValue,
  type FetchImplementation,
  JovieInputError,
  JovieRequestError,
  type ResourceOptions,
  readResponseBody,
} from './client.js';

/**
 * Fleet audit trail (workers/observability-ingest/src/audit, jovie-fleet-audit worker).
 * Read-only: agents act as one GitHub identity, so this is the only place that
 * says which agent did what. The read token stays in env, never in argv.
 */
export const AUDIT_DEFAULT_URL =
  'https://jovie-fleet-audit.tim-fd8.workers.dev';
export const AUDIT_MAX_LIMIT = 200;
export const AUDIT_DEFAULT_LIMIT = 50;

export type AuditEvent = {
  readonly id: string;
  readonly ts: string;
  readonly actor_agent: string;
  readonly session_id: string | null;
  readonly host: string | null;
  readonly repo: string | null;
  readonly target: string;
  readonly action: string;
  readonly danger: 0 | 1;
  readonly reason: string | null;
  readonly issue: string | null;
  readonly outcome: string | null;
  readonly before: string | null;
  readonly after: string | null;
  readonly source: 'gh-shim' | 'git-shim' | 'broker' | 'correlator';
};

export type AuditCorrelation = {
  readonly id: string;
  readonly observed_at: string;
  readonly repo: string | null;
  readonly target: string;
  readonly change: string;
  readonly github_actor: string | null;
  readonly matched_event_id: string | null;
  readonly status: 'attributed' | 'unattributed';
};

export type AuditWho = {
  readonly ok: true;
  readonly events: readonly AuditEvent[];
  readonly correlations: readonly AuditCorrelation[];
};

export type AuditSummary = {
  readonly ok: true;
  readonly budget: {
    readonly bytes_month: number;
    readonly limit_bytes: number;
    readonly pct: number;
  };
  readonly dangerous: readonly AuditEvent[];
  readonly unattributed: readonly AuditCorrelation[];
  readonly counts: { readonly events_24h: number; readonly events_7d: number };
  readonly top_actors_24h?: readonly {
    readonly actor_agent: string;
    readonly n: number;
  }[];
};

export type AuditEnv = Readonly<Record<string, string | undefined>>;
export type AuditOptions = Pick<
  ResourceOptions,
  'fetchImpl' | 'timeoutMs' | 'userAgent'
> & { readonly env?: AuditEnv };

function auditOrigin(env: AuditEnv): string {
  const raw = env.FLEET_AUDIT_URL?.trim() || AUDIT_DEFAULT_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new JovieInputError('FLEET_AUDIT_URL must be an origin URL.');
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new JovieInputError(
      'FLEET_AUDIT_URL must be an https origin (http only on loopback).'
    );
  return url.origin;
}

function auditToken(env: AuditEnv): string {
  const token = env.FLEET_AUDIT_READ_TOKEN?.trim();
  if (!token)
    throw new JovieInputError(
      'FLEET_AUDIT_READ_TOKEN is not set. Export the fleet audit read token (Doppler) and retry.'
    );
  return token;
}

const RELATIVE_SINCE = /^(\d{1,4})([mhdw])$/;
const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/** `7d`/`24h`/`30m`/`2w` relative to now, or an ISO timestamp. */
export function parseSince(value: string, now = new Date()): string {
  const text = value.trim();
  const relative = RELATIVE_SINCE.exec(text);
  if (relative) {
    const unit = relative[2] as keyof typeof UNIT_MS;
    return new Date(
      now.getTime() - Number(relative[1]) * UNIT_MS[unit]
    ).toISOString();
  }
  const parsed = new Date(text);
  if (!/^\d{4}-\d{2}-\d{2}/.test(text) || Number.isNaN(parsed.getTime()))
    throw new JovieInputError(
      '--since must be a duration like 7d, 24h, 30m, or an ISO timestamp.'
    );
  return parsed.toISOString();
}

export function parseLimit(value: string | undefined): number {
  if (value === undefined) return AUDIT_DEFAULT_LIMIT;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > AUDIT_MAX_LIMIT)
    throw new JovieInputError(
      `--limit must be a whole number from 1 to ${AUDIT_MAX_LIMIT}.`
    );
  return limit;
}

async function auditGet<T extends { ok: true }>(
  path: string,
  options: AuditOptions
): Promise<T> {
  const env = options.env ?? process.env;
  const origin = auditOrigin(env);
  const token = auditToken(env);
  const signal = AbortSignal.timeout(options.timeoutMs ?? 30_000);
  const fetchImpl: FetchImplementation =
    options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  let response: Response;
  try {
    response = await fetchImpl(`${origin}${path}`, {
      method: 'GET',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.userAgent ? { 'User-Agent': options.userAgent } : {}),
      },
      signal,
    });
  } catch {
    throw new JovieRequestError(
      'Fleet audit service unavailable. Try again shortly.',
      origin,
      undefined,
      undefined,
      undefined,
      'TEMPORARILY_UNAVAILABLE',
      true
    );
  }
  let text: string;
  try {
    text = await readResponseBody(response, signal);
  } catch {
    throw new JovieRequestError(
      'Fleet audit response could not be read.',
      origin,
      response.status
    );
  }
  if (response.status === 401 || response.status === 403)
    throw new JovieRequestError(
      'Fleet audit rejected FLEET_AUDIT_READ_TOKEN.',
      origin,
      response.status
    );
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = undefined;
  }
  const ok =
    response.ok &&
    payload !== null &&
    typeof payload === 'object' &&
    (payload as { ok?: unknown }).ok === true;
  if (!ok)
    throw new JovieRequestError(
      `Fleet audit request failed (${response.status}).`,
      origin,
      response.status,
      displayValue(text, 200)
    );
  return payload as T;
}

export function auditWho(
  input: { target: string; since?: string; limit?: string },
  options: AuditOptions = {}
): Promise<AuditWho> {
  const target = input.target.trim();
  if (!target) throw new JovieInputError('Missing required argument: target.');
  const query = new URLSearchParams({ target });
  if (input.since) query.set('since', parseSince(input.since));
  query.set('limit', String(parseLimit(input.limit)));
  return auditGet<AuditWho>(`/v1/who?${query}`, options);
}

export function auditSummary(
  options: AuditOptions = {}
): Promise<AuditSummary> {
  return auditGet<AuditSummary>('/v1/summary', options);
}

const cell = (value: string | null | undefined, max: number) =>
  displayValue(value ?? '-', max);

function table(headers: readonly string[], rows: readonly string[][]): string {
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map(row => row[i]?.length ?? 0))
  );
  const line = (row: readonly string[]) =>
    row
      .map((value, i) => value.padEnd(widths[i] ?? 0))
      .join('  ')
      .trimEnd();
  return [line(headers), ...rows.map(line)].join('\n');
}

function eventRows(events: readonly AuditEvent[]): string[][] {
  return events.map(event => [
    cell(event.ts, 24),
    cell(event.actor_agent, 24),
    cell(event.host, 16),
    `${event.danger ? '! ' : ''}${cell(event.action, 32)}`,
    cell(event.target, 48),
    cell(event.reason, 60),
  ]);
}

const EVENT_HEADERS = ['TS', 'AGENT', 'HOST', 'ACTION', 'TARGET', 'REASON'];

function unattributedBlock(items: readonly AuditCorrelation[]): string {
  if (!items.length) return 'No unattributed changes.';
  return [
    `UNATTRIBUTED (${items.length}): GitHub changes with no matching agent record`,
    table(
      ['OBSERVED', 'REPO', 'TARGET', 'CHANGE', 'GITHUB ACTOR'],
      items.map(item => [
        cell(item.observed_at, 24),
        cell(item.repo, 32),
        cell(item.target, 48),
        cell(item.change, 32),
        cell(item.github_actor, 24),
      ])
    ),
  ].join('\n');
}

export function formatWho(result: AuditWho): string {
  const unattributed = result.correlations.filter(
    item => item.status === 'unattributed'
  );
  return [
    result.events.length
      ? table(EVENT_HEADERS, eventRows(result.events))
      : 'No audit events match.',
    unattributedBlock(unattributed),
  ].join('\n\n');
}

export function formatSummary(summary: AuditSummary): string {
  const { budget, counts } = summary;
  return [
    `Events: ${counts.events_24h} in 24h, ${counts.events_7d} in 7d. Storage budget: ${budget.pct.toFixed(1)}% of month (${budget.bytes_month} / ${budget.limit_bytes} bytes).`,
    summary.dangerous.length
      ? `DANGEROUS ACTIONS, last 7d (${summary.dangerous.length})\n${table(EVENT_HEADERS, eventRows(summary.dangerous))}`
      : 'No dangerous actions in the last 7d.',
    unattributedBlock(summary.unattributed),
  ].join('\n\n');
}
