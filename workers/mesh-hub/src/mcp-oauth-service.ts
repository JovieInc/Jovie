import { HOTP, Secret } from 'otpauth';
/**
 * TOTP owner proof, PKCE helpers and the async service over OAuthStore (see mcp-oauth.ts for
 * the security model). The service hashes/derives values, then makes one synchronous store call.
 */
import { HubError, sha256Hex } from './core.ts';
import {
  fail,
  type Issued,
  OAUTH,
  OAuthStore,
  type Principal,
  type Scope,
} from './mcp-oauth.ts';

function ownerKey(encoded: string) {
  const key = Secret.fromBase32(encoded.replace(/[\s=-]/g, '').toUpperCase());
  if (key.buffer.byteLength < 10) throw new Error('owner secret too short');
  return key;
}

/** RFC 6238: SHA-1, six digits, 30 s, with one step of clock skew. */
export async function totpCandidates(encoded: string, now: number) {
  const secret = ownerKey(encoded);
  const step = Math.floor(now / 30_000);
  return [step - 1, step, step + 1].map(counter => ({
    step: counter,
    code: HOTP.generate({ secret, counter, algorithm: 'SHA1', digits: 6 }),
  }));
}

// ---- Service ---------------------------------------------------------------------------

const randomToken = (prefix: string, bytes = 32) =>
  `${prefix}${b64url(crypto.getRandomValues(new Uint8Array(bytes)))}`;
export const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  );
  return b64url(new Uint8Array(digest));
}

const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

function validRedirect(uri: string): boolean {
  if (uri.length > OAUTH.maxUriChars) return false;
  if (!URL.canParse(uri)) return false;
  const url = new URL(uri);
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  return (
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  );
}

export function parseScope(
  raw: string | null | undefined,
  fallback: readonly Scope[]
): Scope[] {
  const scope = raw?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!scope.length) return [...fallback];
  if (scope.some(s => !(OAUTH.scopes as readonly string[]).includes(s)))
    return fail(400, 'invalid_scope');
  return [...new Set(scope)] as Scope[];
}

export class OAuthService {
  private readonly store: OAuthStore;
  private readonly ownerSecret: () => string | undefined;
  private readonly clock: () => number;
  constructor(
    store: OAuthStore,
    ownerSecret: () => string | undefined,
    clock: () => number = Date.now
  ) {
    this.store = store;
    this.ownerSecret = ownerSecret;
    this.clock = clock;
  }

  ownerConfigured(): boolean {
    try {
      return Boolean(this.ownerSecret() && ownerKey(this.ownerSecret()!));
    } catch {
      return false;
    }
  }

  register(body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>;
    const uris = b.redirect_uris;
    if (
      !Array.isArray(uris) ||
      !uris.length ||
      uris.length > OAUTH.maxRedirectUris ||
      !uris.every(u => typeof u === 'string' && validRedirect(u))
    )
      return fail(400, 'invalid_redirect_uri');
    const name =
      typeof b.client_name === 'string' && b.client_name.trim()
        ? b.client_name.trim().slice(0, OAUTH.maxNameChars)
        : 'Unnamed client';
    const id = randomToken('mcp_c_', 18);
    this.store.registerClient(
      id,
      name,
      [...new Set(uris as string[])],
      this.clock()
    );
    return {
      client_id: id,
      client_name: name,
      redirect_uris: uris as string[],
    };
  }

  client(id: string) {
    return this.store.client(id);
  }

  async begin(p: Parameters<OAuthStore['begin']>[1]): Promise<string> {
    if (!CHALLENGE.test(p.challenge)) return fail(400, 'invalid_request');
    const raw = randomToken('mcp_p_');
    this.store.begin(await sha256Hex(raw), p, this.clock());
    return raw;
  }

  async pending(raw: string) {
    return this.store.pending(await sha256Hex(raw), this.clock());
  }

  async deny(raw: string) {
    this.store.deny(await sha256Hex(raw));
    return true;
  }

  /** Owner approves. Returns the redirect target data plus the raw one-time code. */
  async consent(raw: string, ownerCode: string, scope: Scope[]) {
    const secret = this.ownerSecret();
    if (!secret || !this.ownerConfigured())
      return fail(503, 'owner_not_configured');
    const now = this.clock();
    const pendingHash = await sha256Hex(raw);
    // Lock check first so a locked hub does not even do the work.
    if (this.store.consentLocked(now)) return fail(429, 'consent_locked');
    const candidates = await totpCandidates(secret, now);
    const code = randomToken('mcp_a_');
    const out = this.store.consent(
      pendingHash,
      ownerCode.replace(/\s/g, ''),
      candidates,
      scope,
      await sha256Hex(code),
      this.clock()
    );
    return { ...out, code };
  }

  async token(encoded: URLSearchParams | string) {
    const form = new URLSearchParams(encoded);
    const grantType = form.get('grant_type');
    const clientId = form.get('client_id') ?? '';
    if (!this.store.client(clientId)) return fail(401, 'invalid_client');
    const access = randomToken('mcp_at_');
    const refresh = randomToken('mcp_rt_');
    const now = this.clock();
    let issued: Issued;
    if (grantType === 'authorization_code') {
      const verifier = form.get('code_verifier') ?? '';
      if (!VERIFIER.test(verifier)) return fail(400, 'invalid_grant');
      issued = this.store.exchangeCode(
        {
          codeHash: await sha256Hex(form.get('code') ?? ''),
          clientId,
          redirectUri: form.get('redirect_uri') ?? '',
          verifierChallenge: await pkceChallenge(verifier),
          grantId: randomToken('mcp_g_', 18),
          accessHash: await sha256Hex(access),
          refreshHash: await sha256Hex(refresh),
        },
        now
      );
    } else if (grantType === 'refresh_token') {
      issued = this.store.refresh(
        {
          refreshHash: await sha256Hex(form.get('refresh_token') ?? ''),
          clientId,
          accessHash: await sha256Hex(access),
          newRefreshHash: await sha256Hex(refresh),
        },
        now
      );
    } else return fail(400, 'unsupported_grant_type');
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: 'Bearer' as const,
      expires_in: issued.expiresIn,
      scope: issued.scope,
    };
  }

  async authenticate(rawAccess: string): Promise<Principal | null> {
    return this.store.authenticate(await sha256Hex(rawAccess), this.clock());
  }

  allowWrite(grantId: string): boolean {
    return this.store.allowWrite(grantId, this.clock());
  }

  async revoke(rawToken: string, clientId: string | null) {
    this.store.revokeToken(await sha256Hex(rawToken), clientId, this.clock());
    return true;
  }

  revokeAll() {
    return this.store.revokeAll(this.clock());
  }

  revokeGrant(id: string) {
    return this.store.revokeById(id, this.clock());
  }

  grants() {
    return this.store.grants();
  }
}

/** Value-returning dispatch used by the DO (errors cross RPC as values) and by tests. */
export async function callService(
  svc: OAuthService,
  method: string,
  args: unknown[]
): Promise<
  { ok: true; value: unknown } | { ok: false; status: number; code: string }
> {
  try {
    // Only explicit service methods cross the internal RPC boundary; never prototype helpers.
    if (
      method === 'constructor' ||
      !Object.hasOwn(OAuthService.prototype, method)
    )
      return { ok: false, status: 404, code: 'not_found' };
    const call = svc[method as keyof OAuthService] as (
      ...values: unknown[]
    ) => unknown;
    return { ok: true, value: await call.apply(svc, args) };
  } catch (error) {
    if (error instanceof HubError)
      return { ok: false, status: error.status, code: error.code };
    throw error;
  }
}
