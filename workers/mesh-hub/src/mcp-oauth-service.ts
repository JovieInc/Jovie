/**
 * TOTP owner proof, PKCE helpers and the async service over OAuthStore (see mcp-oauth.ts for
 * the security model). The service hashes/derives values, then makes one synchronous store call.
 */
import { HubError, sha256Hex } from './core.ts';
import {
  type Issued,
  OAUTH,
  OAuthStore,
  type Principal,
  type Scope,
} from './mcp-oauth.ts';

// ---- TOTP (RFC 6238, SHA-1, 6 digits, 30 s) ---------------------------------------------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Decode(input: string): Uint8Array<ArrayBuffer> {
  const clean = input.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out) as Uint8Array<ArrayBuffer>;
}

export async function hotp(
  secret: Uint8Array<ArrayBuffer>,
  counter: number
): Promise<string> {
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setUint32(0, Math.floor(counter / 2 ** 32));
  new DataView(msg.buffer).setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin =
    ((mac[offset]! & 0x7f) << 24) |
    (mac[offset + 1]! << 16) |
    (mac[offset + 2]! << 8) |
    mac[offset + 3]!;
  return String(bin % 1_000_000).padStart(6, '0');
}

/** The valid codes for now-30 s, now and now+30 s. */
export async function totpCandidates(secretBase32: string, now: number) {
  const secret = base32Decode(secretBase32);
  if (secret.length < 10) throw new Error('owner secret too short');
  const step = Math.floor(now / 30_000);
  return Promise.all(
    [step - 1, step, step + 1].map(async s => ({
      step: s,
      code: await hotp(secret, s),
    }))
  );
}

// ---- Service ---------------------------------------------------------------------------

const fail = (status: number, code: string): never => {
  throw new HubError(status, code);
};

const randomToken = (prefix: string, bytes = 32) => {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return `${prefix}${b64url(raw)}`;
};
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
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
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
  if (!raw?.trim()) return [...fallback];
  const out = new Set<Scope>();
  for (const part of raw.trim().split(/\s+/)) {
    if (!(OAUTH.scopes as readonly string[]).includes(part))
      return fail(400, 'invalid_scope');
    out.add(part as Scope);
  }
  return [...out];
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
      return (
        !!this.ownerSecret() && base32Decode(this.ownerSecret()!).length >= 10
      );
    } catch {
      return false;
    }
  }

  register(body: unknown): {
    client_id: string;
    client_name: string;
    redirect_uris: string[];
  } {
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

  async begin(p: {
    clientId: string;
    redirectUri: string;
    state: string | null;
    challenge: string;
    scope: Scope[];
  }): Promise<string> {
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

  async token(form: URLSearchParams): Promise<{
    access_token: string;
    refresh_token: string;
    token_type: 'Bearer';
    expires_in: number;
    scope: string;
  }> {
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
      token_type: 'Bearer',
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
    switch (method) {
      case 'ownerConfigured':
        return { ok: true, value: svc.ownerConfigured() };
      case 'register':
        return { ok: true, value: svc.register(args[0]) };
      case 'client':
        return { ok: true, value: svc.client(String(args[0])) };
      case 'begin':
        return {
          ok: true,
          value: await svc.begin(
            args[0] as Parameters<OAuthService['begin']>[0]
          ),
        };
      case 'pending':
        return { ok: true, value: await svc.pending(String(args[0])) };
      case 'deny':
        await svc.deny(String(args[0]));
        return { ok: true, value: true };
      case 'consent':
        return {
          ok: true,
          value: await svc.consent(
            String(args[0]),
            String(args[1]),
            args[2] as Scope[]
          ),
        };
      case 'token':
        return {
          ok: true,
          value: await svc.token(new URLSearchParams(String(args[0]))),
        };
      case 'authenticate':
        return { ok: true, value: await svc.authenticate(String(args[0])) };
      case 'allowWrite':
        return { ok: true, value: svc.allowWrite(String(args[0])) };
      case 'revoke':
        await svc.revoke(String(args[0]), args[1] ? String(args[1]) : null);
        return { ok: true, value: true };
      case 'grants':
        return { ok: true, value: svc.grants() };
      case 'revokeAll':
        return { ok: true, value: svc.revokeAll() };
      case 'revokeGrant':
        return { ok: true, value: svc.revokeGrant(String(args[0])) };
      default:
        return { ok: false, status: 404, code: 'not_found' };
    }
  } catch (error) {
    if (error instanceof HubError)
      return { ok: false, status: error.status, code: error.code };
    throw error;
  }
}
