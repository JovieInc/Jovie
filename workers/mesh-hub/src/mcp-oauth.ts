/**
 * Durable, synchronous OAuth state. The async service supplies hashes and owner
 * TOTP candidates; each state transition completes without interleaving awaits.
 * Owner presence, PKCE binding, token reuse revocation and caps are enforced here.
 * Full protocol and owner setup: ../README.md#remote-mcp-mcp-for-claudeai-custom-connectors.
 */
import { HubError, type Sql } from './core.ts';

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

const SCHEMA = `
CREATE TABLE IF NOT EXISTS oc (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, uris TEXT NOT NULL, createdAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pend (
     hash TEXT PRIMARY KEY, clientId TEXT NOT NULL, redirectUri TEXT NOT NULL, state TEXT,
     challenge TEXT NOT NULL, scope TEXT NOT NULL, createdAt INTEGER NOT NULL,
     expiresAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS codes (
     hash TEXT PRIMARY KEY, clientId TEXT NOT NULL, redirectUri TEXT NOT NULL,
     challenge TEXT NOT NULL, scope TEXT NOT NULL, expiresAt INTEGER NOT NULL,
     usedAt INTEGER, grantId TEXT);
CREATE TABLE IF NOT EXISTS grants (
     id TEXT PRIMARY KEY, clientId TEXT NOT NULL, scope TEXT NOT NULL,
     createdAt INTEGER NOT NULL, lastUsedAt INTEGER, revokedAt INTEGER);
CREATE TABLE IF NOT EXISTS toks (
     hash TEXT PRIMARY KEY, kind TEXT NOT NULL, grantId TEXT NOT NULL,
     expiresAt INTEGER NOT NULL, usedAt INTEGER);
CREATE TABLE IF NOT EXISTS fails (at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rate (
     bucket TEXT PRIMARY KEY, windowStart INTEGER NOT NULL, n INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`.split(
  ';'
);

export type Client = { id: string; name: string; uris: string[] };
export type Principal = { grantId: string; clientId: string; scope: Scope[] };
export type Issued = { scope: string; expiresIn: number };

const num = (value: unknown) => Number(value);
export const fail = (status: number, code: string): never => {
  throw new HubError(status, code);
};

export class OAuthStore {
  private readonly sql: Sql;
  constructor(sql: Sql) {
    this.sql = sql;
    for (const statement of SCHEMA) sql.exec(statement);
  }

  private exec(query: string, bindings: unknown[] = []) {
    return this.sql.exec(query, ...bindings).toArray();
  }

  /** Fixed-window counter. Returns false when the window is already full. */
  rate(bucket: string, limit: number, windowMs: number, now: number): boolean {
    const row = this.exec('SELECT windowStart, n FROM rate WHERE bucket = ?', [
      bucket,
    ])[0];
    if (!row || now - num(row.windowStart) >= windowMs) {
      this.exec(
        'INSERT OR REPLACE INTO rate (bucket, windowStart, n) VALUES (?, ?, 1)',
        [bucket, now]
      );
      return true;
    }
    if (num(row.n) >= limit) return false;
    this.exec('UPDATE rate SET n = n + 1 WHERE bucket = ?', [bucket]);
    return true;
  }

  private prune(now: number) {
    this.exec('DELETE FROM pend WHERE expiresAt < ?', [now]);
    this.exec('DELETE FROM codes WHERE expiresAt < ?', [now - 3_600_000]);
    this.exec('DELETE FROM toks WHERE expiresAt < ?', [now - 86_400_000]);
    this.exec('DELETE FROM fails WHERE at < ?', [now - OAUTH.consentLongMs]);
    this.exec(
      `DELETE FROM oc WHERE createdAt < ? AND id NOT IN (SELECT clientId FROM grants WHERE revokedAt IS NULL)
         AND id NOT IN (SELECT clientId FROM pend)`,
      [now - 86_400_000]
    );
  }

  registerClient(id: string, name: string, uris: string[], now: number) {
    this.prune(now);
    if (!this.rate('register', OAUTH.registrationsPerHour, 3_600_000, now))
      fail(429, 'registration_rate_limited');
    const count = num(this.exec('SELECT COUNT(*) AS c FROM oc')[0]?.c);
    if (count >= OAUTH.maxClients) fail(429, 'too_many_clients');
    this.exec(
      'INSERT INTO oc (id, name, uris, createdAt) VALUES (?, ?, ?, ?)',
      [id, name, JSON.stringify(uris), now]
    );
  }

  client(id: string): Client | null {
    const row = this.exec('SELECT * FROM oc WHERE id = ?', [id])[0];
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
    this.exec('DELETE FROM pend WHERE expiresAt < ?', [now]);
    const open = num(this.exec('SELECT COUNT(*) AS c FROM pend')[0]?.c);
    if (open >= OAUTH.maxPending) fail(429, 'too_many_pending');
    this.exec(
      `INSERT INTO pend (hash, clientId, redirectUri, state, challenge, scope, createdAt, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hash,
        p.clientId,
        p.redirectUri,
        p.state,
        p.challenge,
        p.scope.join(' '),
        now,
        now + OAUTH.pendingTtlMs,
      ]
    );
    // After the insert, so the client being authorized is never pruned out from under it.
    this.prune(now);
  }

  pending(hash: string, now: number) {
    const row = this.exec(
      'SELECT * FROM pend WHERE hash = ? AND expiresAt >= ?',
      [hash, now]
    )[0];
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
        this.exec('SELECT COUNT(*) AS c FROM fails WHERE at >= ?', [
          now - ms,
        ])[0]?.c
      );
    return (
      since(OAUTH.consentShortMs) >= OAUTH.consentFailsShort ||
      since(OAUTH.consentLongMs) >= OAUTH.consentFailsLong
    );
  }

  deny(hash: string) {
    this.exec('DELETE FROM pend WHERE hash = ?', [hash]);
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
      this.exec("SELECT v FROM meta WHERE k = 'totpStep'")[0]?.v ?? 0
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
      this.exec('INSERT INTO fails (at) VALUES (?)', [now]);
      return fail(403, 'invalid_owner_code');
    }
    if (!scope.length || scope.some(s => !pending.scope.includes(s)))
      return fail(400, 'invalid_scope');
    this.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('totpStep', ?)", [
      String(matched),
    ]);
    this.exec('DELETE FROM pend WHERE hash = ?', [pendingHash]);
    this.exec(
      `INSERT INTO codes (hash, clientId, redirectUri, challenge, scope, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        codeHash,
        pending.client.id,
        pending.redirectUri,
        pending.challenge,
        scope.join(' '),
        now + OAUTH.codeTtlMs,
      ]
    );
    return { redirectUri: pending.redirectUri, state: pending.state };
  }

  private revokeGrant(grantId: string, now: number) {
    this.exec(
      'UPDATE grants SET revokedAt = ? WHERE id = ? AND revokedAt IS NULL',
      [now, grantId]
    );
  }

  private insertTokens(
    grantId: string,
    accessHash: string,
    refreshHash: string,
    now: number
  ) {
    this.exec(
      'INSERT INTO toks (hash, kind, grantId, expiresAt) VALUES (?, ?, ?, ?)',
      [accessHash, 'access', grantId, now + OAUTH.accessTtlMs]
    );
    this.exec(
      'INSERT INTO toks (hash, kind, grantId, expiresAt) VALUES (?, ?, ?, ?)',
      [refreshHash, 'refresh', grantId, now + OAUTH.refreshTtlMs]
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
    const row = this.exec('SELECT * FROM codes WHERE hash = ?', [
      p.codeHash,
    ])[0];
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
    const active = this.exec(
      'SELECT id FROM grants WHERE revokedAt IS NULL ORDER BY createdAt DESC'
    );
    for (const old of active.slice(OAUTH.maxGrants - 1))
      this.revokeGrant(String(old.id), now);
    this.exec('UPDATE codes SET usedAt = ?, grantId = ? WHERE hash = ?', [
      now,
      p.grantId,
      p.codeHash,
    ]);
    this.exec(
      'INSERT INTO grants (id, clientId, scope, createdAt) VALUES (?, ?, ?, ?)',
      [p.grantId, p.clientId, String(row.scope), now]
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
    const row = this.exec(
      `SELECT t.*, g.clientId AS gClient, g.scope AS gScope, g.revokedAt AS gRevoked
           FROM toks t JOIN grants g ON g.id = t.grantId WHERE t.hash = ? AND t.kind = 'refresh'`,
      [p.refreshHash]
    )[0];
    if (!row || row.gClient !== p.clientId) return fail(400, 'invalid_grant');
    const grantId = String(row.grantId);
    if (row.gRevoked !== null) return fail(400, 'invalid_grant');
    if (row.usedAt !== null) {
      // Rotated token presented again: assume theft, end the whole grant.
      this.revokeGrant(grantId, now);
      return fail(400, 'invalid_grant');
    }
    if (num(row.expiresAt) < now) return fail(400, 'invalid_grant');
    this.exec('UPDATE toks SET usedAt = ? WHERE hash = ?', [
      now,
      p.refreshHash,
    ]);
    this.insertTokens(grantId, p.accessHash, p.newRefreshHash, now);
    return {
      scope: String(row.gScope),
      expiresIn: OAUTH.accessTtlMs / 1000,
    };
  }

  /** Resolve a presented access token and enforce the per-grant call limit. */
  authenticate(accessHash: string, now: number): Principal | null {
    const row = this.exec(
      `SELECT t.grantId, g.clientId, g.scope, g.lastUsedAt FROM toks t
           JOIN grants g ON g.id = t.grantId
          WHERE t.hash = ? AND t.kind = 'access' AND t.expiresAt >= ? AND g.revokedAt IS NULL`,
      [accessHash, now]
    )[0];
    if (!row) return null;
    const grantId = String(row.grantId);
    if (!this.rate(`calls:${grantId}`, OAUTH.callsPerMinute, 60_000, now))
      return fail(429, 'rate_limited');
    if (row.lastUsedAt === null || now - num(row.lastUsedAt) > 60_000)
      this.exec('UPDATE grants SET lastUsedAt = ? WHERE id = ?', [
        now,
        grantId,
      ]);
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
    const row = this.exec(
      'SELECT t.grantId, g.clientId FROM toks t JOIN grants g ON g.id = t.grantId WHERE t.hash = ?',
      [hash]
    )[0];
    if (row && (clientId === null || row.clientId === clientId))
      this.revokeGrant(String(row.grantId), now);
  }

  revokeById(grantId: string, now: number): number {
    return this.exec(
      'UPDATE grants SET revokedAt = ? WHERE id = ? AND revokedAt IS NULL RETURNING id',
      [now, grantId]
    ).length;
  }

  revokeAll(now: number): number {
    return this.exec(
      'UPDATE grants SET revokedAt = ? WHERE revokedAt IS NULL RETURNING id',
      [now]
    ).length;
  }

  grants() {
    return this.exec(
      `SELECT g.id, g.scope, g.createdAt, g.lastUsedAt, c.name AS client FROM grants g
       LEFT JOIN oc c ON c.id = g.clientId WHERE g.revokedAt IS NULL ORDER BY g.createdAt DESC`
    );
  }
}

function constantEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
