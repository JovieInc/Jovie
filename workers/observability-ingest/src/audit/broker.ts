/**
 * Token broker: agents never hold a long-lived GitHub credential. They ask the broker for a
 * short-lived (1 h) jovie-bot installation token, and the issuance itself is an audit event.
 *
 * Security model (independent review of #23742, 2026-10-29):
 *  - Issuance has its own credential. Each broker client holds a per-client key (Worker secret
 *    BROKER_CLIENT_KEYS, {clientId: key}); the fleet-audit ingest secret cannot mint tokens.
 *  - Requests are HMAC-signed over `${timestamp}\n${nonce}\n${body}`, accepted only within
 *    +/-5 minutes, and each (client, nonce) is stored so a replay is rejected.
 *  - What a client may get comes from the server-side grant table (D1 broker_grants): its agent
 *    class, allowed repositories and allowed scopes. Identity is the grant's agent class, never a
 *    request field; the request can only narrow (scope, repositories) and must give a reason.
 *
 * Tiers (one App, permissions narrowed per request):
 *   fleet  code, PRs, issues; read-only checks/statuses/actions.
 *   ci     actions:write only (cancel/rerun runs). Needs a linked issue.
 *   watch  internal only (hourly correlation): actions + metadata read; never grantable.
 *   admin  not mintable: rulesets/branch protection need administration:write, which jovie-bot
 *          does not have. That stays with a human.
 */

export type Scope = 'fleet' | 'ci' | 'watch';
export const GRANTABLE_SCOPES = ['fleet', 'ci'] as const;
export type GrantableScope = (typeof GRANTABLE_SCOPES)[number];

export const SCOPE_PERMISSIONS: Record<
  Scope,
  Record<string, 'read' | 'write'>
> = {
  fleet: {
    contents: 'write',
    pull_requests: 'write',
    issues: 'write',
    checks: 'read',
    statuses: 'read',
    actions: 'read',
    metadata: 'read',
  },
  watch: { actions: 'read', metadata: 'read' },
  ci: { actions: 'write', metadata: 'read' },
};

export const REPLAY_WINDOW_S = 300;

export interface TokenRequest {
  readonly agent: string;
  readonly session?: string | null;
  readonly host?: string | null;
  readonly scope: Scope;
  readonly repositories?: readonly string[];
  readonly reason: string;
  readonly issue?: string | null;
}

export interface Grant {
  client_id: string;
  agent_class: string;
  repos: string; // comma-separated bare repo names
  scopes: string; // comma-separated subset of GRANTABLE_SCOPES
  active: number;
}

/** Validate the body against the caller's grant. Identity comes from the grant, not the body. */
export function authorizeTokenRequest(
  input: unknown,
  grant: Grant
): TokenRequest | string {
  if (!input || typeof input !== 'object') return 'body must be an object';
  const r = input as Record<string, unknown>;
  if ('agent' in r)
    return 'agent is set by the server from your grant; do not send it';
  if (r.scope !== 'fleet' && r.scope !== 'ci')
    return 'scope must be fleet or ci';
  const allowedScopes = grant.scopes.split(',').map(x => x.trim());
  if (!allowedScopes.includes(r.scope))
    return `scope ${r.scope} is not granted to ${grant.client_id}`;
  if (typeof r.reason !== 'string' || r.reason.trim().length < 8)
    return 'reason (>= 8 chars) is required';
  if (
    r.scope === 'ci' &&
    (typeof r.issue !== 'string' || r.issue.trim().length < 3)
  )
    return 'ci scope needs a linked issue';
  const allowedRepos = grant.repos
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
  let repos = allowedRepos;
  if (r.repositories !== undefined) {
    if (
      !Array.isArray(r.repositories) ||
      r.repositories.length === 0 ||
      r.repositories.length > 10
    )
      return 'repositories: 1 to 10 bare repo names';
    if (
      r.repositories.some(
        x => typeof x !== 'string' || !allowedRepos.includes(x)
      )
    )
      return `repositories must be a subset of the grant (${allowedRepos.join(', ')})`;
    repos = r.repositories as string[];
  }
  if (repos.length === 0) return 'grant has no repositories';
  return {
    agent: grant.agent_class,
    session: typeof r.session === 'string' ? r.session.slice(0, 80) : null,
    host: typeof r.host === 'string' ? r.host.slice(0, 60) : null,
    scope: r.scope,
    repositories: repos,
    reason: r.reason.slice(0, 300),
    issue: typeof r.issue === 'string' ? r.issue.slice(0, 120) : null,
  };
}

async function hmacHex(key: string, text: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    k,
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(sig)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function brokerSigningInput(
  ts: string,
  nonce: string,
  body: string
): string {
  return `${ts}\n${nonce}\n${body}`;
}

export async function signBrokerRequest(
  key: string,
  ts: string,
  nonce: string,
  body: string
) {
  return `sha256=${await hmacHex(key, brokerSigningInput(ts, nonce, body))}`;
}

/**
 * Authenticate a broker client: per-client key (never the ingest secret), signature over
 * timestamp + nonce + body, timestamp window. Returns the client id or an error.
 */
export async function authenticateBrokerClient(opts: {
  headers: Headers;
  body: string;
  clientKeysJson: string | undefined;
  ingestSecret: string;
  nowSec: number;
}): Promise<
  { clientId: string; nonce: string } | { status: number; error: string }
> {
  const clientId = opts.headers.get('x-fleet-broker-client') ?? '';
  const ts = opts.headers.get('x-fleet-broker-timestamp') ?? '';
  const nonce = opts.headers.get('x-fleet-broker-nonce') ?? '';
  const sig = opts.headers.get('x-fleet-broker-signature') ?? '';
  if (
    !/^[\w.:-]{2,64}$/.test(clientId) ||
    !/^\d{9,11}$/.test(ts) ||
    !/^[\w-]{16,128}$/.test(nonce) ||
    !sig
  )
    return { status: 401, error: 'missing or malformed broker credentials' };
  let keys: Record<string, string> = {};
  try {
    keys = JSON.parse(opts.clientKeysJson ?? '{}');
  } catch {
    return { status: 503, error: 'broker_keys_unreadable' };
  }
  const key = keys[clientId];
  if (!key || key.length < 32)
    return { status: 401, error: 'unknown broker client' };
  if (key === opts.ingestSecret)
    return {
      status: 503,
      error: 'broker key must differ from the ingest secret',
    };
  if (Math.abs(opts.nowSec - Number(ts)) > REPLAY_WINDOW_S)
    return { status: 401, error: 'timestamp outside window' };
  if (!safeEqual(sig, await signBrokerRequest(key, ts, nonce, opts.body)))
    return { status: 401, error: 'invalid broker signature' };
  return { clientId, nonce };
}

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : new Uint8Array(data as ArrayBuffer);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPkcs8(pem: string): Promise<CryptoKey> {
  if (pem.includes('BEGIN RSA PRIVATE KEY'))
    throw new Error(
      'GITHUB_APP_PRIVATE_KEY must be PKCS#8 (openssl pkcs8 -topk8 -nocrypt)'
    );
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

export async function appJwt(
  appId: string,
  pem: string,
  nowSec: number
): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ iat: nowSec - 60, exp: nowSec + 540, iss: appId })
  );
  const key = await importPkcs8(pem);
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  return `${header}.${payload}.${b64url(sig)}`;
}

export async function mintInstallationToken(opts: {
  appId: string;
  installationId: string;
  privateKey: string;
  request: TokenRequest;
  fetchImpl?: typeof fetch;
  nowSec?: number;
}): Promise<{
  token: string;
  expires_at: string;
  permissions: Record<string, string>;
}> {
  const jwt = await appJwt(
    opts.appId,
    opts.privateKey,
    opts.nowSec ?? Math.floor(Date.now() / 1000)
  );
  const res = await (opts.fetchImpl ?? fetch)(
    `https://api.github.com/app/installations/${opts.installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'jovie-fleet-audit-broker',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({
        repositories: opts.request.repositories,
        permissions: SCOPE_PERMISSIONS[opts.request.scope],
      }),
    }
  );
  if (!res.ok) throw new Error(`github token mint failed: ${res.status}`);
  const out = (await res.json()) as {
    token: string;
    expires_at: string;
    permissions: Record<string, string>;
  };
  return {
    token: out.token,
    expires_at: out.expires_at,
    permissions: out.permissions,
  };
}

export interface RepoStateItem {
  kind: 'workflow' | 'ruleset';
  id: number;
  name: string;
  path?: string;
  state?: string;
  updated_at?: string;
}

async function ghGet<T>(
  path: string,
  token: string,
  fetchImpl: typeof fetch
): Promise<T> {
  const res = await fetchImpl(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'jovie-fleet-audit',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return (await res.json()) as T;
}

interface WorkflowRow {
  id: number;
  name: string;
  path: string;
  state: string;
  updated_at: string;
}

/** Workflow states plus ruleset versions; about 3 + N(rulesets) calls per repo per hour. */
export async function collectRepoState(
  repo: string,
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<RepoStateItem[]> {
  const items: RepoStateItem[] = [];
  for (let page = 1; page <= 5; page++) {
    const body = await ghGet<{ workflows?: WorkflowRow[] }>(
      `/repos/${repo}/actions/workflows?per_page=100&page=${page}`,
      token,
      fetchImpl
    );
    const list = body.workflows ?? [];
    for (const w of list)
      items.push({
        kind: 'workflow',
        id: w.id,
        name: w.name,
        path: w.path,
        state: w.state,
        updated_at: w.updated_at,
      });
    if (list.length < 100) break;
  }
  // A failed ruleset read fails the whole collection: skipping it would read as ruleset removals.
  const rulesets = await ghGet<Array<{ id: number; name: string }>>(
    `/repos/${repo}/rulesets?per_page=100`,
    token,
    fetchImpl
  );
  for (const r of rulesets) {
    const full = await ghGet<{ updated_at?: string }>(
      `/repos/${repo}/rulesets/${r.id}`,
      token,
      fetchImpl
    );
    items.push({
      kind: 'ruleset',
      id: r.id,
      name: r.name,
      updated_at: full.updated_at,
    });
  }
  return items;
}
