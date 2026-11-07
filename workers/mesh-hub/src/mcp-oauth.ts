/**
 * OAuth 2.1 authorization server for the hub's remote MCP endpoint (`/mcp`).
 *
 * Security model (what makes this safe to expose):
 * - Nothing mints an authorization code without the OWNER proving presence on the consent
 *   step: a TOTP code from a secret only Tim holds (`MCP_OWNER_TOTP_SECRET`). A client
 *   registered by anyone (Dynamic Client Registration is open by design) gets nothing
 *   until the owner approves it. No secret configured means no consent: fail closed.
 * - All state is durable (Durable Object SQLite). Nothing here is isolate-local.
 * - Public clients only, PKCE S256 mandatory, exact redirect_uri match, codes live 60 s and
 *   work once (reuse revokes the grant), access tokens live 1 h, refresh tokens rotate and
 *   reuse revokes the grant. Only sha256 of codes/tokens is stored.
 * - Every capability has a limit (OAUTH below).
 *
 * `OAuthStore` is synchronous and takes pre-hashed values so it runs inside a DO (where an
 * `await` between read and write could interleave) and under node:test (node:sqlite).
 * `OAuthService` does the async hashing/TOTP and then makes one synchronous store call.
 */
import { HubError, type Sql, sha256Hex } from './core.ts';

export const OAUTH = {
  scopes: ['mesh:read', 'mesh:write'] as const,
  codeTtlMs: 60_000,
  pendingTtlMs: 600_000,
  accessTtlMs: 3_600_000,
  refreshTtlMs: 30 * 86_400_000,
  maxClients: 200,
  registrationsPerHour: 20,
  maxPending: 100,
  maxGrants: 25,
  maxRedirectUris: 5,
  maxUriChars: 300,
  maxNameChars: 100,
  /** Wrong owner codes: 5 in 15 minutes or 20 in 24 hours lock consent until the window passes. */
  consentFailsShort: 5,
  consentShortMs: 900_000,
  consentFailsLong: 20,
  consentLongMs: 86_400_000,
  callsPerMinute: 120,
  writesPerMinute: 30,
} as const;

export type Scope = (typeof OAUTH.scopes)[number];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS oc (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, uris TEXT NOT NULL, createdAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pend (
     hash TEXT PRIMARY KEY, clientId TEXT NOT NULL, redirectUri TEXT NOT NULL, state TEXT,
     challenge TEXT NOT NULL, scope TEXT NOT NULL, createdAt INTEGER NOT NULL,
     expiresAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS codes (
     hash TEXT PRIMARY KEY, clientId TEXT NOT NULL, redirectUri TEXT NOT NULL,
     challenge TEXT NOT NULL, scope TEXT NOT NULL, expiresAt INTEGER NOT NULL,
     usedAt INTEGER, grantId TEXT)`,
  `CREATE TABLE IF NOT EXISTS grants (
     id TEXT PRIMARY KEY, clientId TEXT NOT NULL, scope TEXT NOT NULL,
     createdAt INTEGER NOT NULL, lastUsedAt INTEGER, revokedAt INTEGER)`,
  `CREATE TABLE IF NOT EXISTS toks (
     hash TEXT PRIMARY KEY, kind TEXT NOT NULL, grantId TEXT NOT NULL,
     expiresAt INTEGER NOT NULL, usedAt INTEGER)`,
  `CREATE TABLE IF NOT EXISTS fails (at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rate (
     bucket TEXT PRIMARY KEY, windowStart INTEGER NOT NULL, n INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
];

export type Client = { id: string; name: string; uris: string[] };
export type Principal = { grantId: string; clientId: string; scope: Scope[] };
export type Issued = {
  scope: string;
  expiresIn: number;
};

const num = (value: unknown) => Number(value);
const fail = (status: number, code: string): never => {
  throw new HubError(status, code);
};

export class OAuthStore {
  private readonly sql: Sql;
  constructor(sql: Sql) {
    this.sql = sql;
    for (const statement of SCHEMA) sql.exec(statement);
  }

  /** Fixed-window counter. Returns false when the window is already full. */
  rate(bucket: string, limit: number, windowMs: number, now: number): boolean {
    const row = this.sql
      .exec('SELECT windowStart, n FROM rate WHERE bucket = ?', bucket)
      .toArray()[0];
    if (!row || now - num(row.windowStart) >= windowMs) {
      this.sql.exec(
        'INSERT OR REPLACE INTO rate (bucket, windowStart, n) VALUES (?, ?, 1)',
        bucket,
        now
      );
      return true;
    }
    if (num(row.n) >= limit) return false;
    this.sql.exec('UPDATE rate SET n = n + 1 WHERE bucket = ?', bucket);
    return true;
  }

  private prune(now: number) {
    this.sql.exec('DELETE FROM pend WHERE expiresAt < ?', now);
    this.sql.exec('DELETE FROM codes WHERE expiresAt < ?', now - 3_600_000);
    this.sql.exec('DELETE FROM toks WHERE expiresAt < ?', now - 86_400_000);
    this.sql.exec('DELETE FROM fails WHERE at < ?', now - OAUTH.consentLongMs);
    this.sql.exec(
      `DELETE FROM oc WHERE createdAt < ? AND id NOT IN (SELECT clientId FROM grants WHERE revokedAt IS NULL)
         AND id NOT IN (SELECT clientId FROM pend)`,
      now - 86_400_000
    );
  }

  registerClient(id: string, name: string, uris: string[], now: number) {
    this.prune(now);
    if (!this.rate('register', OAUTH.registrationsPerHour, 3_600_000, now))
      fail(429, 'registration_rate_limited');
    const count = num(
      this.sql.exec('SELECT COUNT(*) AS c FROM oc').toArray()[0]?.c
    );
    if (count >= OAUTH.maxClients) fail(429, 'too_many_clients');
    this.sql.exec(
      'INSERT INTO oc (id, name, uris, createdAt) VALUES (?, ?, ?, ?)',
      id,
      name,
      JSON.stringify(uris),
      now
    );
  }

  client(id: string): Client | null {
    const row = this.sql.exec('SELECT * FROM oc WHERE id = ?', id).toArray()[0];
    return row
      ? {
          id: String(row.id),
          name: String(row.name),
          uris: JSON.parse(String(row.uris)),
        }
      : null;
  }

  begin(
    hash: string,
    p: {
      clientId: string;
      redirectUri: string;
      state: string | null;
      challenge: string;
      scope: Scope[];
    },
    now: number
  ) {
    this.prune(now);
    const open = num(
      this.sql.exec('SELECT COUNT(*) AS c FROM pend').toArray()[0]?.c
    );
    if (open >= OAUTH.maxPending) fail(429, 'too_many_pending');
    this.sql.exec(
      `INSERT INTO pend (hash, clientId, redirectUri, state, challenge, scope, createdAt, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      hash,
      p.clientId,
      p.redirectUri,
      p.state,
      p.challenge,
      p.scope.join(' '),
      now,
      now + OAUTH.pendingTtlMs
    );
  }

  pending(hash: string, now: number) {
    const row = this.sql
      .exec('SELECT * FROM pend WHERE hash = ? AND expiresAt >= ?', hash, now)
      .toArray()[0];
    if (!row) return null;
    const client = this.client(String(row.clientId));
    if (!client) return null;
    return {
      client,
      redirectUri: String(row.redirectUri),
      state: row.state === null ? null : String(row.state),
      scope: String(row.scope).split(' ').filter(Boolean) as Scope[],
      challenge: String(row.challenge),
    };
  }

  consentLocked(now: number): boolean {
    const since = (ms: number) =>
      num(
        this.sql
          .exec('SELECT COUNT(*) AS c FROM fails WHERE at >= ?', now - ms)
          .toArray()[0]?.c
      );
    return (
      since(OAUTH.consentShortMs) >= OAUTH.consentFailsShort ||
      since(OAUTH.consentLongMs) >= OAUTH.consentFailsLong
    );
  }

  deny(hash: string) {
    this.sql.exec('DELETE FROM pend WHERE hash = ?', hash);
  }

  /**
   * The owner-proof gate. `candidates` are the valid TOTP codes for the current window, each
   * with its step; `submitted` must equal one and its step must be newer than the last one
   * accepted (no replay). Only then is the pending request consumed and a code recorded.
   */
  consent(
    pendingHash: string,
    submitted: string,
    candidates: ReadonlyArray<{ step: number; code: string }>,
    scope: Scope[],
    codeHash: string,
    now: number
  ) {
    if (this.consentLocked(now)) fail(429, 'consent_locked');
    const pending = this.pending(pendingHash, now);
    if (!pending) return fail(400, 'invalid_request');
    const last = num(
      this.sql.exec("SELECT v FROM meta WHERE k = 'totpStep'").toArray()[0]
        ?.v ?? 0
    );
    let matched: number | null = null;
    for (const candidate of candidates)
      if (
        constantEq(candidate.code, submitted) &&
        candidate.step > last &&
        (matched === null || candidate.step > matched)
      )
        matched = candidate.step;
    if (matched === null) {
      this.sql.exec('INSERT INTO fails (at) VALUES (?)', now);
      return fail(403, 'invalid_owner_code');
    }
    if (!scope.length || scope.some(s => !pending.scope.includes(s)))
      return fail(400, 'invalid_scope');
    this.sql.exec(
      "INSERT OR REPLACE INTO meta (k, v) VALUES ('totpStep', ?)",
      String(matched)
    );
    this.sql.exec('DELETE FROM pend WHERE hash = ?', pendingHash);
    this.sql.exec(
      `INSERT INTO codes (hash, clientId, redirectUri, challenge, scope, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      codeHash,
      pending.client.id,
      pending.redirectUri,
      pending.challenge,
      scope.join(' '),
      now + OAUTH.codeTtlMs
    );
    return { redirectUri: pending.redirectUri, state: pending.state };
  }

  private revokeGrant(grantId: string, now: number) {
    this.sql.exec(
      'UPDATE grants SET revokedAt = ? WHERE id = ? AND revokedAt IS NULL',
      now,
      grantId
    );
  }

  private insertTokens(
    grantId: string,
    accessHash: string,
    refreshHash: string,
    now: number
  ) {
    this.sql.exec(
      'INSERT INTO toks (hash, kind, grantId, expiresAt) VALUES (?, ?, ?, ?)',
      accessHash,
      'access',
      grantId,
      now + OAUTH.accessTtlMs
    );
    this.sql.exec(
      'INSERT INTO toks (hash, kind, grantId, expiresAt) VALUES (?, ?, ?, ?)',
      refreshHash,
      'refresh',
      grantId,
      now + OAUTH.refreshTtlMs
    );
  }

  exchangeCode(
    p: {
      codeHash: string;
      clientId: string;
      redirectUri: string;
      verifierChallenge: string;
      grantId: string;
      accessHash: string;
      refreshHash: string;
    },
    now: number
  ): Issued {
    const row = this.sql
      .exec('SELECT * FROM codes WHERE hash = ?', p.codeHash)
      .toArray()[0];
    if (!row) return fail(400, 'invalid_grant');
    if (row.usedAt !== null) {
      // A replayed code means it leaked: kill whatever it produced.
      if (row.grantId) this.revokeGrant(String(row.grantId), now);
      return fail(400, 'invalid_grant');
    }
    if (
      num(row.expiresAt) < now ||
      row.clientId !== p.clientId ||
      row.redirectUri !== p.redirectUri ||
      row.challenge !== p.verifierChallenge
    )
      return fail(400, 'invalid_grant');
    const active = this.sql
      .exec(
        'SELECT id FROM grants WHERE revokedAt IS NULL ORDER BY createdAt DESC'
      )
      .toArray();
    for (const old of active.slice(OAUTH.maxGrants - 1))
      this.revokeGrant(String(old.id), now);
    this.sql.exec(
      'UPDATE codes SET usedAt = ?, grantId = ? WHERE hash = ?',
      now,
      p.grantId,
      p.codeHash
    );
    this.sql.exec(
      'INSERT INTO grants (id, clientId, scope, createdAt) VALUES (?, ?, ?, ?)',
      p.grantId,
      p.clientId,
      String(row.scope),
      now
    );
    this.insertTokens(p.grantId, p.accessHash, p.refreshHash, now);
    return { scope: String(row.scope), expiresIn: OAUTH.accessTtlMs / 1000 };
  }

  refresh(
    p: {
      refreshHash: string;
      clientId: string;
      accessHash: string;
      newRefreshHash: string;
    },
    now: number
  ): Issued {
    const row = this.sql
      .exec(
        `SELECT t.*, g.clientId AS gClient, g.scope AS gScope, g.revokedAt AS gRevoked
           FROM toks t JOIN grants g ON g.id = t.grantId WHERE t.hash = ? AND t.kind = 'refresh'`,
        p.refreshHash
      )
      .toArray()[0];
    if (!row || row.gClient !== p.clientId) return fail(400, 'invalid_grant');
    const grantId = String(row.grantId);
    if (row.gRevoked !== null) return fail(400, 'invalid_grant');
    if (row.usedAt !== null) {
      // Rotated token presented again: assume theft, end the whole grant.
      this.revokeGrant(grantId, now);
      return fail(400, 'invalid_grant');
    }
    if (num(row.expiresAt) < now) return fail(400, 'invalid_grant');
    this.sql.exec(
      'UPDATE toks SET usedAt = ? WHERE hash = ?',
      now,
      p.refreshHash
    );
    this.insertTokens(grantId, p.accessHash, p.newRefreshHash, now);
    return {
      scope: String(row.gScope),
      expiresIn: OAUTH.accessTtlMs / 1000,
    };
  }

  /** Resolve a presented access token and enforce the per-grant call limit. */
  authenticate(accessHash: string, now: number): Principal | null {
    const row = this.sql
      .exec(
        `SELECT t.grantId, g.clientId, g.scope, g.lastUsedAt FROM toks t
           JOIN grants g ON g.id = t.grantId
          WHERE t.hash = ? AND t.kind = 'access' AND t.expiresAt >= ? AND g.revokedAt IS NULL`,
        accessHash,
        now
      )
      .toArray()[0];
    if (!row) return null;
    const grantId = String(row.grantId);
    if (!this.rate(`calls:${grantId}`, OAUTH.callsPerMinute, 60_000, now))
      return fail(429, 'rate_limited');
    if (row.lastUsedAt === null || now - num(row.lastUsedAt) > 60_000)
      this.sql.exec(
        'UPDATE grants SET lastUsedAt = ? WHERE id = ?',
        now,
        grantId
      );
    return {
      grantId,
      clientId: String(row.clientId),
      scope: String(row.scope).split(' ').filter(Boolean) as Scope[],
    };
  }

  allowWrite(grantId: string, now: number): boolean {
    return this.rate(`writes:${grantId}`, OAUTH.writesPerMinute, 60_000, now);
  }

  /** RFC 7009: revoking any token of a grant ends the whole grant. */
  revokeToken(hash: string, clientId: string | null, now: number) {
    const row = this.sql
      .exec(
        'SELECT t.grantId, g.clientId FROM toks t JOIN grants g ON g.id = t.grantId WHERE t.hash = ?',
        hash
      )
      .toArray()[0];
    if (row && (clientId === null || row.clientId === clientId))
      this.revokeGrant(String(row.grantId), now);
  }

  revokeById(grantId: string, now: number): number {
    const before = this.sql
      .exec(
        'SELECT COUNT(*) AS c FROM grants WHERE id = ? AND revokedAt IS NULL',
        grantId
      )
      .toArray()[0]?.c;
    this.revokeGrant(grantId, now);
    return num(before);
  }

  revokeAll(now: number): number {
    const count = num(
      this.sql
        .exec('SELECT COUNT(*) AS c FROM grants WHERE revokedAt IS NULL')
        .toArray()[0]?.c
    );
    this.sql.exec(
      'UPDATE grants SET revokedAt = ? WHERE revokedAt IS NULL',
      now
    );
    return count;
  }

  grants() {
    return this.sql
      .exec(
        `SELECT g.id, g.scope, g.createdAt, g.lastUsedAt, c.name FROM grants g
           LEFT JOIN oc c ON c.id = g.clientId WHERE g.revokedAt IS NULL ORDER BY g.createdAt DESC`
      )
      .toArray()
      .map(r => ({
        id: String(r.id),
        client: r.name === null ? null : String(r.name),
        scope: String(r.scope),
        createdAt: num(r.createdAt),
        lastUsedAt: r.lastUsedAt === null ? null : num(r.lastUsedAt),
      }));
  }
}

function constantEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

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
