import * as Sentry from '@sentry/nextjs';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { type DbOrTransaction, db } from '@/lib/db';
import { getDeepErrorMessage, unwrapPgError } from '@/lib/db/errors';
import { waitlistSettings } from '@/lib/db/schema/waitlist';
import { captureWarning } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';

const SETTINGS_ROW_ID = 1;

// ---------------------------------------------------------------------------
// Multi-layer cache for gate status (in-memory + Redis-backed)
// ---------------------------------------------------------------------------
//
// `isWaitlistGateEnabled` is hit on every authenticated middleware
// cache-miss via `proxy-state.ts`, so re-querying the DB on every call is
// expensive (and `getWaitlistSettings` may run an INSERT on a cold instance).
// We layer a short-lived in-memory cache (5s, per-isolate hot path) in front
// of a Redis cache (30s TTL, fleet-wide). Admin updates call
// `invalidateWaitlistGateCache()` which clears both layers (DEL on Redis)
// so toggles propagate immediately across all Vercel isolates.
//
// This reuses the established getRedis + Sentry breadcrumb + captureWarning
// patterns from proxy-state.ts, admin/roles.ts, and db/cache.ts for
// admin-toggled / hot global values. No new services or tables.
//
// Observability: breadcrumbs emitted for redis hits, redis misses, db fetches,
// and fleet-wide invalidations so operators can verify "gate verifiably toggled".
const GATE_MEMORY_TTL_MS = 5_000;
const GATE_REDIS_TTL_SECONDS = 30;
const GATE_CACHE_KEY = 'waitlist:gate:enabled';

let _gateEnabledCache: { value: boolean; expiresAt: number } | null = null;

/**
 * Check if the waitlist gate is enabled.
 *
 * Multi-layer cached (5s local memory + 30s Redis) so authenticated middleware
 * cache-misses don't add a DB round-trip per request. The cache is invalidated
 * fleet-wide (Redis DEL) whenever `updateWaitlistSettings` runs so admin toggles
 * take effect on the next request across the entire fleet (max staleness ~5s
 * due to local memory layer).
 */
export async function isWaitlistGateEnabled(): Promise<boolean> {
  const now = Date.now();
  if (_gateEnabledCache && _gateEnabledCache.expiresAt > now) {
    return _gateEnabledCache.value;
  }

  // Layer: Redis (durable, shared across isolates for admin toggle freshness)
  const redis = getRedis();
  if (redis) {
    try {
      const cacheStart = Date.now();
      const redisTimeoutPromise = new Promise<null>(resolve =>
        setTimeout(() => resolve(null), 500)
      );
      const cached = await Promise.race([
        redis.get<boolean>(GATE_CACHE_KEY),
        redisTimeoutPromise,
      ]);
      const cacheDuration = Date.now() - cacheStart;

      if (cached !== null) {
        Sentry.addBreadcrumb({
          category: 'waitlist-gate',
          message: 'Cache hit (redis)',
          level: 'info',
          data: {
            cacheKey: GATE_CACHE_KEY,
            durationMs: cacheDuration,
            value: cached,
          },
        });
        _gateEnabledCache = {
          value: cached,
          expiresAt: now + GATE_MEMORY_TTL_MS,
        };
        return cached;
      }

      Sentry.addBreadcrumb({
        category: 'waitlist-gate',
        message: 'Cache miss (redis)',
        level: 'info',
        data: {
          cacheKey: GATE_CACHE_KEY,
          durationMs: cacheDuration,
        },
      });
    } catch (cacheError) {
      captureWarning('[waitlist-gate] Redis cache read failed', {
        error: cacheError,
      });
    }
  }

  // Miss: fetch from DB (use ensure for hardened atomic path; avoids
  // incidental daily-reset side-effect that getWaitlistSettings performs)
  const value = await fetchGateEnabledFromDb();
  _gateEnabledCache = {
    value,
    expiresAt: now + GATE_MEMORY_TTL_MS,
  };

  if (redis) {
    redis
      .set(GATE_CACHE_KEY, value, { ex: GATE_REDIS_TTL_SECONDS })
      .catch(cacheError => {
        captureWarning('[waitlist-gate] Redis cache write failed', {
          error: cacheError,
        });
      });
  }

  Sentry.addBreadcrumb({
    category: 'waitlist-gate',
    message: 'Cache miss (db fetch)',
    level: 'info',
    data: {
      cacheKey: GATE_CACHE_KEY,
      value,
    },
  });

  return value;
}

async function fetchGateEnabledFromDb(): Promise<boolean> {
  const row = await ensureSettingsRow();
  return row.gateEnabled;
}

/**
 * Clear the gate cache (both local memory and Redis). Called after admin
 * settings update so the next request on any isolate picks up the new value
 * immediately (subject only to the 5s local memory TTL on that isolate).
 */
export async function invalidateWaitlistGateCache(): Promise<void> {
  _gateEnabledCache = null;

  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(GATE_CACHE_KEY);
      Sentry.addBreadcrumb({
        category: 'waitlist-gate',
        message: 'Cache invalidated fleet-wide (Redis DEL)',
        level: 'info',
        data: { cacheKey: GATE_CACHE_KEY },
      });
    } catch (error) {
      captureWarning('[waitlist-gate] Failed to invalidate Redis cache', {
        error,
      });
    }
  }
}

export interface WaitlistGateSettings {
  gateEnabled: boolean;
  autoAcceptEnabled: boolean;
  autoAcceptAfterDays: number;
  autoAcceptDailyLimit: number;
  autoAcceptedToday: number;
  autoAcceptResetsAt: Date;
}

function getStartOfNextDayUTC(now: Date = new Date()): Date {
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

/**
 * Documented default gate state — matches the column defaults in
 * `lib/db/schema/waitlist.ts` (gate on, auto-accept off). Used when the
 * settings row cannot be materialized and when the `waitlist_settings`
 * relation is missing in prod (migration drift, JOV-3353).
 */
function getDefaultWaitlistGateSettings(
  now: Date = new Date()
): WaitlistGateSettings {
  return {
    gateEnabled: true,
    autoAcceptEnabled: false,
    autoAcceptAfterDays: 7,
    autoAcceptDailyLimit: 0,
    autoAcceptedToday: 0,
    autoAcceptResetsAt: getStartOfNextDayUTC(now),
  };
}

/**
 * True when Postgres reports the `waitlist_settings` relation is missing —
 * the known migration-drift class where code ships ahead of the prod
 * migration (JOV-3353). Drizzle surfaces these as "Failed query: ..." with
 * the underlying PG error (42P01 undefined_table) on `.cause`.
 */
export function isMissingWaitlistSettingsTableError(error: unknown): boolean {
  const message = getDeepErrorMessage(error).toLowerCase();
  if (
    !message.includes('does not exist') &&
    unwrapPgError(error).code !== '42P01'
  ) {
    return false;
  }

  return message.includes('waitlist_settings');
}

async function ensureSettingsRow(
  dbOrTx: DbOrTransaction = db
): Promise<WaitlistGateSettings> {
  try {
    // Hot path: cheap SELECT first (matches previous behavior and keeps
    // existing test mocks working without requiring full insert chain mocks).
    const [existing] = await dbOrTx
      .select()
      .from(waitlistSettings)
      .where(eq(waitlistSettings.id, SETTINGS_ROW_ID))
      .limit(1);

    if (existing) {
      return existing;
    }

    const now = new Date();

    // Miss path: single atomic upsert (INSERT ... ON CONFLICT DO UPDATE) creates
    // the row if absent. On concurrent first callers, the loser takes the
    // conflict path and still receives the row via RETURNING — no reload race,
    // no throw ever.
    const [row] = await dbOrTx
      .insert(waitlistSettings)
      .values({
        id: SETTINGS_ROW_ID,
        gateEnabled: true,
        autoAcceptEnabled: false,
        autoAcceptAfterDays: 7,
        autoAcceptDailyLimit: 0,
        autoAcceptedToday: 0,
        autoAcceptResetsAt: getStartOfNextDayUTC(now),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: waitlistSettings.id,
        set: {
          // Self-assignment is a deliberate no-op: ensures RETURNING yields the
          // existing row on the conflict path without mutating data or timestamps.
          updatedAt: drizzleSql`${waitlistSettings.updatedAt}`,
        },
      })
      .returning();

    if (row) {
      return row;
    }

    // Defensive fallback (extremely rare). Plain select again, else safe defaults.
    // Guarantees ensureSettingsRow (and therefore gate + auto-accept paths) never
    // throws on reload.
    const [reloaded] = await dbOrTx
      .select()
      .from(waitlistSettings)
      .where(eq(waitlistSettings.id, SETTINGS_ROW_ID))
      .limit(1);

    if (reloaded) {
      return reloaded;
    }

    return getDefaultWaitlistGateSettings(now);
  } catch (error) {
    // Migration drift (JOV-3353): degrade reads to the documented default
    // gate state instead of 500-ing /start and /signin. Only the missing-
    // relation class degrades; every other error still throws. Write paths
    // (admin updates) surface the error from their own UPDATE statement.
    if (!isMissingWaitlistSettingsTableError(error)) {
      throw error;
    }
    await captureWarning(
      '[waitlist] waitlist_settings relation missing (migration drift); using default gate settings',
      error
    );
    return getDefaultWaitlistGateSettings();
  }
}

export async function getWaitlistSettings(
  dbOrTx: DbOrTransaction = db
): Promise<WaitlistGateSettings> {
  const row = await ensureSettingsRow(dbOrTx);
  const now = new Date();

  if (row.autoAcceptResetsAt > now) return row;

  const [updated] = await dbOrTx
    .update(waitlistSettings)
    .set({
      autoAcceptedToday: 0,
      autoAcceptResetsAt: getStartOfNextDayUTC(now),
      updatedAt: now,
    })
    .where(eq(waitlistSettings.id, SETTINGS_ROW_ID))
    .returning();

  return updated ?? row;
}

export async function updateWaitlistSettings(input: {
  gateEnabled: boolean;
  autoAcceptEnabled: boolean;
  autoAcceptAfterDays: number;
  autoAcceptDailyLimit: number;
}): Promise<WaitlistGateSettings> {
  const current = await ensureSettingsRow();
  const now = new Date();

  const [updated] = await db
    .update(waitlistSettings)
    .set({
      gateEnabled: input.gateEnabled,
      autoAcceptEnabled: input.autoAcceptEnabled,
      autoAcceptAfterDays: Math.max(1, Math.trunc(input.autoAcceptAfterDays)),
      autoAcceptDailyLimit: Math.max(0, Math.trunc(input.autoAcceptDailyLimit)),
      autoAcceptedToday:
        current.autoAcceptResetsAt <= now ? 0 : current.autoAcceptedToday,
      autoAcceptResetsAt:
        current.autoAcceptResetsAt <= now
          ? getStartOfNextDayUTC(now)
          : current.autoAcceptResetsAt,
      updatedAt: now,
    })
    .where(eq(waitlistSettings.id, SETTINGS_ROW_ID))
    .returning();

  if (!updated) throw new Error('Failed to update waitlist settings');
  await invalidateWaitlistGateCache();
  return updated;
}

export async function tryReserveAutoAcceptSlot(
  dbOrTx?: DbOrTransaction
): Promise<{
  shouldAutoAccept: boolean;
  reason: 'auto_accept_disabled' | 'capacity_full' | 'reserved';
}> {
  const client = dbOrTx ?? db;
  const settings = await getWaitlistSettings(client);

  if (!settings.autoAcceptEnabled || settings.autoAcceptDailyLimit <= 0) {
    return { shouldAutoAccept: false, reason: 'auto_accept_disabled' };
  }

  if (settings.autoAcceptedToday >= settings.autoAcceptDailyLimit) {
    return { shouldAutoAccept: false, reason: 'capacity_full' };
  }

  const now = new Date();
  const result = await client
    .update(waitlistSettings)
    .set({
      autoAcceptedToday: drizzleSql`${waitlistSettings.autoAcceptedToday} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(waitlistSettings.id, SETTINGS_ROW_ID),
        eq(waitlistSettings.autoAcceptEnabled, true),
        drizzleSql`${waitlistSettings.autoAcceptedToday} < ${waitlistSettings.autoAcceptDailyLimit}`
      )
    )
    .returning({ id: waitlistSettings.id });

  return result.length > 0
    ? { shouldAutoAccept: true, reason: 'reserved' }
    : { shouldAutoAccept: false, reason: 'capacity_full' };
}
