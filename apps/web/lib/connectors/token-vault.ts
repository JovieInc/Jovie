/**
 * Token Vault — AI Connector OAuth token storage
 *
 * The single authoritative path for reading and writing connector OAuth tokens.
 * All tokens are encrypted at rest via `encryptPII` / `decryptPII` (AES-256-GCM).
 *
 * SECURITY INVARIANTS:
 * - Never import this module in `'use client'` files.
 * - Never log or capture raw token values anywhere in this module.
 * - `withRefreshLock` uses a Postgres CAS update on `tokenRefreshLockedUntil` to
 *   ensure exactly one caller refreshes the token at a time per connector account.
 */

import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  connectorAccounts,
  connectorSyncStates,
} from '@/lib/db/schema/connectors';
import { decryptPII, encryptPII } from '@/lib/utils/pii-encryption';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when a concurrent caller already holds the refresh lock for an account. */
export class RefreshLockBusyError extends Error {
  readonly connectorAccountId: string;
  constructor(connectorAccountId: string) {
    super(
      `Token refresh lock is held by another caller for account ${connectorAccountId}`
    );
    this.name = 'RefreshLockBusyError';
    this.connectorAccountId = connectorAccountId;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoreTokensParams {
  readonly connectorAccountId: string;
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt: Date;
}

export interface LoadedTokens {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: Date;
}

// Lock duration: 60 seconds is enough for a token exchange round-trip.
const REFRESH_LOCK_DURATION_MS = 60_000;

// ---------------------------------------------------------------------------
// storeTokens
// ---------------------------------------------------------------------------

/**
 * Encrypts and persists OAuth tokens for a connector account.
 * Tokens are encrypted using `encryptPII` before writing to the database.
 * This function never logs token values; it fails closed (throws) on DB error.
 *
 * @throws Will throw if the DB write fails or encryption is unavailable in prod.
 */
export async function storeTokens(params: StoreTokensParams): Promise<void> {
  const { connectorAccountId, accessToken, refreshToken, expiresAt } = params;

  // Encrypt tokens — encryptPII throws in prod if PII_ENCRYPTION_KEY is missing.
  const encryptedAccessToken = encryptPII(accessToken);
  const encryptedRefreshToken = refreshToken ? encryptPII(refreshToken) : null;

  const updated = await db
    .update(connectorAccounts)
    .set({
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(connectorAccounts.id, connectorAccountId))
    .returning({ id: connectorAccounts.id });

  if (updated.length === 0) {
    throw new Error(
      `storeTokens: connector account not found: ${connectorAccountId}`
    );
  }
}

// ---------------------------------------------------------------------------
// loadDecryptedToken
// ---------------------------------------------------------------------------

/**
 * Loads and decrypts OAuth tokens for a connector account.
 * Returns `null` if the account does not exist or has no access token stored.
 * Never throws on missing account — callers must handle null (e.g. trigger reauth).
 */
export async function loadDecryptedToken(
  connectorAccountId: string
): Promise<LoadedTokens | null> {
  const rows = await db
    .select({
      encryptedAccessToken: connectorAccounts.encryptedAccessToken,
      encryptedRefreshToken: connectorAccounts.encryptedRefreshToken,
      tokenExpiresAt: connectorAccounts.tokenExpiresAt,
    })
    .from(connectorAccounts)
    .where(eq(connectorAccounts.id, connectorAccountId))
    .limit(1);

  if (rows.length === 0 || !rows[0].encryptedAccessToken) {
    return null;
  }

  const row = rows[0];

  const accessToken = decryptPII(row.encryptedAccessToken);
  if (!accessToken) {
    // Decryption failure — treat as no token (triggers reauth path).
    return null;
  }

  const refreshToken = row.encryptedRefreshToken
    ? decryptPII(row.encryptedRefreshToken)
    : null;

  const expiresAt = row.tokenExpiresAt ?? new Date(0);

  return {
    accessToken,
    refreshToken,
    expiresAt,
  };
}

// ---------------------------------------------------------------------------
// withRefreshLock
// ---------------------------------------------------------------------------

/**
 * Acquires a per-account row-level CAS refresh lock, runs `fn`, then releases.
 *
 * The lock is implemented as a Postgres UPDATE WHERE CAS on
 * `connector_sync_states.tokenRefreshLockedUntil`. The lock row is keyed to a
 * synthetic `resourceKind = '__token_refresh_lock__'` so it does not interfere
 * with real sync cursor rows.
 *
 * Lock acquisition:
 *   UPDATE connector_sync_states
 *   SET    tokenRefreshLockedUntil = now() + 60s
 *   WHERE  connectorAccountId = :id
 *     AND  resourceKind = '__token_refresh_lock__'
 *     AND  (tokenRefreshLockedUntil IS NULL OR tokenRefreshLockedUntil < now())
 *   RETURNING id
 *
 * If 0 rows returned, a concurrent caller holds the lock → throws RefreshLockBusyError.
 * The lock row is created (upserted) on first use so callers don't need to pre-seed.
 *
 * @throws {RefreshLockBusyError} if the lock is held by another caller.
 * @throws Whatever `fn` throws (lock is always released in finally).
 */
export async function withRefreshLock<T>(
  connectorAccountId: string,
  fn: () => Promise<T>
): Promise<T> {
  const LOCK_RESOURCE_KIND = '__token_refresh_lock__';
  const lockedUntil = new Date(Date.now() + REFRESH_LOCK_DURATION_MS);

  // Upsert the lock row then CAS-acquire.
  // Step 1: ensure the lock row exists (INSERT ON CONFLICT DO NOTHING).
  await db
    .insert(connectorSyncStates)
    .values({
      connectorAccountId,
      resourceKind: LOCK_RESOURCE_KIND,
      tokenRefreshLockedUntil: null,
    })
    .onConflictDoNothing();

  // Step 2: CAS acquire — only succeeds if lock is free.
  const now = new Date();
  const acquired = await db
    .update(connectorSyncStates)
    .set({ tokenRefreshLockedUntil: lockedUntil })
    .where(
      and(
        eq(connectorSyncStates.connectorAccountId, connectorAccountId),
        eq(connectorSyncStates.resourceKind, LOCK_RESOURCE_KIND),
        or(
          isNull(connectorSyncStates.tokenRefreshLockedUntil),
          lt(connectorSyncStates.tokenRefreshLockedUntil, now)
        )
      )
    )
    .returning({ id: connectorSyncStates.id });

  if (acquired.length === 0) {
    throw new RefreshLockBusyError(connectorAccountId);
  }

  try {
    return await fn();
  } finally {
    // Release lock by clearing the expiry. Best-effort: ignore DB errors here
    // since the lock will expire naturally after REFRESH_LOCK_DURATION_MS.
    await db
      .update(connectorSyncStates)
      .set({ tokenRefreshLockedUntil: null })
      .where(
        and(
          eq(connectorSyncStates.connectorAccountId, connectorAccountId),
          eq(connectorSyncStates.resourceKind, LOCK_RESOURCE_KIND)
        )
      )
      .catch(() => {
        // Intentionally swallowed — the lock expires naturally.
      });
  }
}
