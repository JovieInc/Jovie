import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { unwrapPgError } from '@/lib/db/errors';
import { dailyProfileViews } from '@/lib/db/schema/analytics';
import { captureWarning } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export function isMissingDailyProfileViewsTableError(error: unknown): boolean {
  return unwrapPgError(error).code === '42P01';
}

export async function incrementDailyProfileViews(
  tx: DbOrTransaction,
  profileId: string,
  viewDate: string,
  now: Date
): Promise<void> {
  const values = {
    creatorProfileId: profileId,
    viewDate,
    viewCount: 1,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await tx
      .insert(dailyProfileViews)
      .values(values)
      .onConflictDoUpdate({
        target: [
          dailyProfileViews.creatorProfileId,
          dailyProfileViews.viewDate,
        ],
        set: {
          viewCount: drizzleSql`${dailyProfileViews.viewCount} + 1`,
          updatedAt: now,
        },
      });
    return;
  } catch (error) {
    const isMissingConflictTarget =
      error instanceof Error &&
      (error.message.includes('42P10') ||
        error.message.includes(
          'there is no unique or exclusion constraint matching the ON CONFLICT specification'
        ));

    if (!isMissingConflictTarget) {
      throw error;
    }

    logger.warn(
      '[analytics/daily-profile-views] Missing conflict target for daily_profile_views upsert, using safe fallback update path'
    );
  }

  const [updatedExisting] = await tx
    .update(dailyProfileViews)
    .set({
      viewCount: drizzleSql`${dailyProfileViews.viewCount} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(dailyProfileViews.creatorProfileId, profileId),
        eq(dailyProfileViews.viewDate, viewDate)
      )
    )
    .returning({ id: dailyProfileViews.id });

  if (updatedExisting) {
    return;
  }

  await tx.insert(dailyProfileViews).values(values).onConflictDoNothing();

  await tx
    .update(dailyProfileViews)
    .set({
      viewCount: drizzleSql`${dailyProfileViews.viewCount} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(dailyProfileViews.creatorProfileId, profileId),
        eq(dailyProfileViews.viewDate, viewDate)
      )
    );
}

export async function writeDailyProfileViews(
  tx: DbOrTransaction,
  profileId: string,
  viewDate: string,
  now: Date,
  context: { route: string }
): Promise<void> {
  try {
    await incrementDailyProfileViews(tx, profileId, viewDate, now);
  } catch (error) {
    if (!isMissingDailyProfileViewsTableError(error)) {
      throw error;
    }
    await captureWarning(
      `[${context.route}] daily_profile_views table missing; skipping aggregate write`,
      error,
      { profileId, viewDate }
    );
  }
}
