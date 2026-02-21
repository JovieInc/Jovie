import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { waitlistSettings } from '@/lib/db/schema/waitlist';

const SETTINGS_ROW_ID = 1;

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

async function ensureSettingsRow(): Promise<WaitlistGateSettings> {
  const [existing] = await db
    .select()
    .from(waitlistSettings)
    .where(eq(waitlistSettings.id, SETTINGS_ROW_ID))
    .limit(1);

  if (existing) {
    return existing;
  }

  const now = new Date();
  const [created] = await db
    .insert(waitlistSettings)
    .values({
      id: SETTINGS_ROW_ID,
      gateEnabled: true,
      autoAcceptEnabled: false,
      autoAcceptDailyLimit: 0,
      autoAcceptedToday: 0,
      autoAcceptResetsAt: getStartOfNextDayUTC(now),
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const [reloaded] = await db
    .select()
    .from(waitlistSettings)
    .where(eq(waitlistSettings.id, SETTINGS_ROW_ID))
    .limit(1);

  if (!reloaded) {
    throw new Error('Failed to create waitlist settings');
  }

  return reloaded;
}

export async function getWaitlistSettings(): Promise<WaitlistGateSettings> {
  const row = await ensureSettingsRow();
  const now = new Date();

  if (row.autoAcceptResetsAt > now) return row;

  const [updated] = await db
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
  return updated;
}

export async function tryReserveAutoAcceptSlot(): Promise<{
  shouldAutoAccept: boolean;
}> {
  const settings = await getWaitlistSettings();

  if (!settings.gateEnabled) {
    return { shouldAutoAccept: true };
  }

  if (
    !settings.autoAcceptEnabled ||
    settings.autoAcceptDailyLimit <= 0 ||
    settings.autoAcceptedToday >= settings.autoAcceptDailyLimit
  ) {
    return { shouldAutoAccept: false };
  }

  const now = new Date();
  const result = await db
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

  return { shouldAutoAccept: result.length > 0 };
}
