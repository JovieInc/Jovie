/**
 * Token broker: agents never hold a long-lived GitHub credential. They ask the broker for a
 * short-lived (1 h) jovie-bot installation token scoped to exactly what the task needs, with
 * their agent id, session and reason; the issuance itself is an audit event.
 *
 * Tiers (one App, permissions narrowed per request):
 *   fleet  code, PRs, issues, labels; read-only checks/actions. Default for every lane.
 *   ci     fleet + actions:write (cancel/rerun/enable/disable workflow runs). Needs reason + issue.
 *   admin  not mintable here: rulesets/branch protection need administration:write, which
 *          jovie-bot does not have. That stays with a human (or a separate admin App later).
 */

export type Scope = 'fleet' | 'ci';

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
  ci: {
    contents: 'write',
    pull_requests: 'write',
    issues: 'write',
    checks: 'write',
    statuses: 'write',
    actions: 'write',
    metadata: 'read',
  },
};

export interface TokenRequest {
  readonly agent: string;
  readonly session?: string | null;
  readonly host?: string | null;
  readonly scope: Scope;
  readonly repositories?: readonly string[];
  readonly reason: string;
  readonly issue?: string | null;
}

export function validateTokenRequest(input: unknown): TokenRequest | string {
  if (!input || typeof input !== 'object') return 'body must be an object';
  const r = input as Record<string, unknown>;
  if (typeof r.agent !== 'string' || !/^[\w.:@/-]{2,80}$/.test(r.agent))
    return 'agent is required';
  if (r.scope !== 'fleet' && r.scope !== 'ci')
    return 'scope must be fleet or ci';
  if (typeof r.reason !== 'string' || r.reason.trim().length < 8)
    return 'reason (>= 8 chars) is required';
  if (
    r.scope === 'ci' &&
    (typeof r.issue !== 'string' || r.issue.trim().length < 3)
  )
    return 'ci scope needs a linked issue';
  if (r.repositories !== undefined) {
    if (!Array.isArray(r.repositories) || r.repositories.length > 10)
      return 'repositories: at most 10';
    if (
      r.repositories.some(
        x => typeof x !== 'string' || !/^[\w.-]{1,100}$/.test(x)
      )
    )
      return 'repositories are bare repo names';
  }
  return {
    agent: r.agent,
    session: typeof r.session === 'string' ? r.session.slice(0, 80) : null,
    host: typeof r.host === 'string' ? r.host.slice(0, 60) : null,
    scope: r.scope,
    repositories: (r.repositories as string[] | undefined) ?? ['Jovie'],
    reason: r.reason.slice(0, 300),
    issue: typeof r.issue === 'string' ? r.issue.slice(0, 120) : null,
  };
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
