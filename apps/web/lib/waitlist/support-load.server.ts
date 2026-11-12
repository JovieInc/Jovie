import 'server-only';

import { and, count, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { feedbackItems } from '@/lib/db/schema/feedback';
import { captureError } from '@/lib/error-tracking';
import {
  decideSupportLoadCapacity,
  SUPPORT_LOAD_WINDOW_DAYS,
  type SupportLoadCapacity,
} from '@/lib/waitlist/support-load-capacity';

/**
 * Closed-loop dispositions that still need work. Auto-remediated,
 * duplicate, deferred (`later`) and rejected (`never`) reports are not
 * support load.
 */
const OPEN_BUG_DISPOSITIONS = [
  'pending',
  'pending_summer',
  'cert_required',
  'now',
] as const;

/** Open verifiable bug reports in the support window; null when unreadable. */
export async function countOpenBugReports(
  now = Date.now()
): Promise<number | null> {
  const since = new Date(now - SUPPORT_LOAD_WINDOW_DAYS * 86_400_000);
  try {
    const [row] = await db
      .select({ open: count() })
      .from(feedbackItems)
      .where(
        and(
          eq(feedbackItems.status, 'pending'),
          eq(feedbackItems.classification, 'bug_verifiable'),
          inArray(feedbackItems.disposition, [...OPEN_BUG_DISPOSITIONS]),
          gte(feedbackItems.createdAt, since)
        )
      );
    return row?.open ?? 0;
  } catch (error) {
    await captureError('Support load unreadable for admission', error, {
      route: 'lib/waitlist/support-load.server',
    });
    return null;
  }
}

/** Today's admission budget after the support-load knob. */
export async function readSupportLoadCapacity(settings: {
  readonly autoAcceptDailyLimit: number;
  readonly autoAcceptedToday: number;
}): Promise<SupportLoadCapacity & { readonly remaining: number }> {
  const capacity = decideSupportLoadCapacity({
    baseDailyLimit: settings.autoAcceptDailyLimit,
    openBugReports: await countOpenBugReports(),
  });
  return {
    ...capacity,
    remaining: Math.max(0, capacity.dailyLimit - settings.autoAcceptedToday),
  };
}
