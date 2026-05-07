import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { type DbOrTransaction, db } from '@/lib/db';
import { waitlistSettings } from '@/lib/db/schema/waitlist';

const SETTINGS_ROW_ID = 1;

// ---------------------------------------------------------------------------
// In-memory cache for gate status
// ---------------------------------------------------------------------------
// The waitlist gate setting changes rarely (admin toggle). A short TTL avoids
// hitting the DB on every middleware request while keeping propagation latency
// under 30 seconds. Explicitly invalidated on settings update.
// ---------------------------------------------------------------------------
let _gateEnabledCache: { value: boolean; expiresAt: number } | null = null;
const _GATE_CACHE_TTL_MS = 30_000; // 30s — unused while gate is hardcoded off

/**
 * Check if the waitlist gate is enabled.
 *
 * Hardcoded to `false` — the waitlist gate is permanently disabled so all
 * signups go straight to onboarding. The DB-backed toggle and surrounding
 * infrastructure are preserved for future demand control (re-enable by
 * restoring the DB-driven implementation below).
 *
 * Previous implementation (DB-backed, memory-cached):
 *   if (_gateEnabledCache && Date.now() < _gateEnabledCache.expiresAt) {
 *     return _gateEnabledCache.value;
 *   }
 *   const settings = await getWaitlistSettings();
 *   _gateEnabledCache = { value: settings.gateEnabled, expiresAt: Date.now() + GATE_CACHE_TTL_MS };
 *   return settings.gateEnabled;
 */
export async function isWaitlistGateEnabled(): Promise<boolean> {
  return false;
}

/**
 * Clear the in-memory gate cache. Called after admin settings update
 * so the next request picks up the new value immediately.
 */
export function invalidateWaitlistGateCache(): void {
  _gateEnabledCache = null;
}

export interface WaitlistGateSettings {
  gateEnabled: boolean;
  autoAcceptEnabled: boolean;
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

async function ensureSettingsRow(
  dbOrTx: DbOrTransaction = db
): Promise<WaitlistGateSettings> {
  const [existing] = await dbOrTx
    .select()
    .from(waitlistSettings)
    .where(eq(waitlistSettings.id, SETTINGS_ROW_ID))
    .limit(1);

  if (existing) {
    return existing;
  }

  const now = new Date();
  const [created] = await dbOrTx
    .insert(waitlistSettings)
    .values({
      id: SETTINGS_ROW_ID,
      gateEnabled: false,
      autoAcceptEnabled: false,
      autoAcceptDailyLimit: 0,
      autoAcceptedToday: 0,
      autoAcceptResetsAt: getStartOfNextDayUTC(now),
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const [reloaded] = await dbOrTx
    .select()
    .from(waitlistSettings)
    .where(eq(waitlistSettings.id, SETTINGS_ROW_ID))
    .limit(1);

  if (!reloaded) {
    throw new Error('Failed to create waitlist settings');
  }

  return reloaded;
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
  autoAcceptDailyLimit: number;
}): Promise<WaitlistGateSettings> {
  const current = await ensureSettingsRow();
  const now = new Date();

  const [updated] = await db
    .update(waitlistSettings)
    .set({
      gateEnabled: input.gateEnabled,
      autoAcceptEnabled: input.autoAcceptEnabled,
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
  invalidateWaitlistGateCache();
  return updated;
}

export async function tryReserveAutoAcceptSlot(
  dbOrTx?: DbOrTransaction
): Promise<{
  shouldAutoAccept: boolean;
  reason: 'gate_on' | 'auto_accept_disabled' | 'capacity_full' | 'reserved';
}> {
  const client = dbOrTx ?? db;
  const settings = await getWaitlistSettings(client);

  // Gate off = open floodgates. Matches the hardcoded `isWaitlistGateEnabled`
  // intent: when the gate is down everyone goes straight through onboarding
  // without consuming the autoAccept counter.
  if (!settings.gateEnabled) {
    return { shouldAutoAccept: true, reason: 'reserved' };
  }

  if (!settings.autoAcceptEnabled || settings.autoAcceptDailyLimit <= 0) {
    return { shouldAutoAccept: false, reason: 'gate_on' };
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
        eq(waitlistSettings.gateEnabled, true),
        drizzleSql`${waitlistSettings.autoAcceptedToday} < ${waitlistSettings.autoAcceptDailyLimit}`
      )
    )
    .returning({ id: waitlistSettings.id });

  return result.length > 0
    ? { shouldAutoAccept: true, reason: 'reserved' }
    : { shouldAutoAccept: false, reason: 'capacity_full' };
}
