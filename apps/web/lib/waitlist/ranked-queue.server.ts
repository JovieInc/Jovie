import 'server-only';

import { and, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { getWaitlistSettings } from '@/lib/waitlist/settings';
import {
  compareRankedRows,
  type RankedQueue,
  type RankedQueueRow,
  readAdmissionScore,
} from './ranked-queue';

const QUEUE_LIMIT = 25;

/** The pending queue in the order the daily budget will spend it. */
export async function getRankedWaitlistQueue(): Promise<RankedQueue> {
  const [rows, settings] = await Promise.all([
    db
      .select({
        id: waitlistEntries.id,
        artistName: waitlistEntries.spotifyArtistName,
        status: waitlistEntries.status,
        waitlistedAt: waitlistEntries.waitlistedAt,
        statusReason: waitlistEntries.statusReason,
        qualificationInputs: waitlistEntries.qualificationInputs,
        qualificationResult: waitlistEntries.qualificationResult,
      })
      .from(waitlistEntries)
      .where(
        and(
          eq(waitlistEntries.canonical, true),
          eq(waitlistEntries.status, 'waitlisted')
        )
      )
      .orderBy(
        drizzleSql`coalesce(CASE WHEN (${waitlistEntries.qualificationInputs} -> 'admissionScore' ->> 'score') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (${waitlistEntries.qualificationInputs} -> 'admissionScore' ->> 'score')::numeric END, -1) desc`,
        desc(waitlistEntries.waitlistedAt)
      )
      .limit(QUEUE_LIMIT),
    getWaitlistSettings(),
  ]);

  const mapped: RankedQueueRow[] = rows.map(row => {
    const score = readAdmissionScore(row.qualificationInputs);
    const details = (
      row.qualificationResult as {
        details?: { goldenPathHold?: unknown };
      } | null
    )?.details;
    return {
      entryId: row.id,
      artistName: row.artistName,
      status: row.status,
      waitlistedAt: row.waitlistedAt?.toISOString() ?? null,
      score: score?.score ?? null,
      components: score?.components ?? null,
      unmeasured: score?.unmeasured ?? [],
      followers: score?.inputs.followers ?? null,
      holdReason:
        typeof details?.goldenPathHold === 'string'
          ? details.goldenPathHold
          : null,
    };
  });
  mapped.sort(compareRankedRows);

  return {
    rows: mapped,
    capacity: {
      dailyLimit: settings.autoAcceptDailyLimit,
      usedToday: settings.autoAcceptedToday,
      autoAcceptEnabled: settings.autoAcceptEnabled,
    },
  };
}
