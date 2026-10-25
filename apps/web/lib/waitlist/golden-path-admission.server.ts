import 'server-only';

import { eq } from 'drizzle-orm';
import { readCachedAcquisitionEligibility } from '@/lib/acquisition/eligibility.server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { captureError } from '@/lib/error-tracking';
import {
  countOpenCohortLearnings,
  MAX_OPEN_COHORT_LEARNINGS,
} from '@/lib/waitlist/cohort-learnings';
import {
  decideGoldenPathAdmission,
  type GoldenPathAdmissionDecision,
  type GoldenPathAdmissionReason,
  type GoldenPathVerdict,
} from '@/lib/waitlist/golden-path-admission';
import { getWaitlistSettings } from '@/lib/waitlist/settings';

const THROTTLE_CACHE_MS = 60_000;
let throttleCache: { open: boolean; expiresAt: number } | null = null;

/**
 * Verdict from the cache only: an anonymous chat turn must never trigger the
 * GitHub/canary recompute. The eligibility cache is refreshed by the company
 * state producer; a miss reads as "not green". Requires `eligible === true`
 * as well as the verdict, so a malformed entry cannot admit anyone.
 */
async function readVerdict(): Promise<GoldenPathVerdict | null> {
  try {
    const report = await readCachedAcquisitionEligibility();
    if (!report) return null;
    return report.eligible === true ? report.verdict : 'UNKNOWN';
  } catch (error) {
    await captureError('Golden path verdict unreadable for admission', error, {
      route: 'lib/waitlist/golden-path-admission.server',
    });
    return null;
  }
}

/** Cohort-learnings throttle, read outside any transaction and cached briefly. */
async function isLearningsThrottleOpen(now = Date.now()): Promise<boolean> {
  if (throttleCache && throttleCache.expiresAt > now) return throttleCache.open;
  const open = await countOpenCohortLearnings()
    .then(count => count !== null && count < MAX_OPEN_COHORT_LEARNINGS)
    .catch(() => false);
  throttleCache = { open, expiresAt: now + THROTTLE_CACHE_MS };
  return open;
}

/** Test seam: forget the cached throttle read. */
export function resetGoldenPathAdmissionCaches(): void {
  throttleCache = null;
}

async function readCapacityHold(): Promise<GoldenPathAdmissionReason | null> {
  try {
    const settings = await getWaitlistSettings();
    if (!settings.autoAcceptEnabled || settings.autoAcceptDailyLimit <= 0) {
      return 'hold_auto_accept_disabled';
    }
    return settings.autoAcceptedToday >= settings.autoAcceptDailyLimit
      ? 'hold_capacity_full'
      : null;
  } catch (error) {
    await captureError('Auto-accept capacity unreadable for admission', error, {
      route: 'lib/waitlist/golden-path-admission.server',
    });
    return 'hold_capacity_full';
  }
}

export interface GoldenPathTurnContext {
  /** Cached verdict; null when unreadable. */
  readonly verdict: GoldenPathVerdict | null;
  /** Why a resolved artist would be held regardless of identity; null if none. */
  readonly holdReason: GoldenPathAdmissionReason | null;
}

/**
 * Everything the chat turn and the claim path need besides the artist: the
 * cached golden-path verdict, plus non-reserving capacity and throttle reads.
 * All reads fail closed. The slot itself is reserved later, inside the waitlist
 * transaction.
 */
export async function readGoldenPathTurnContext(): Promise<GoldenPathTurnContext> {
  const [verdict, capacityHold, throttleOpen] = await Promise.all([
    readVerdict(),
    readCapacityHold(),
    isLearningsThrottleOpen(),
  ]);
  const holdReason =
    capacityHold ?? (throttleOpen ? null : 'hold_open_learnings');
  return { verdict, holdReason };
}

/** The server-side decision used at claim time. */
export async function decideGoldenPathAdmissionForArtist(input: {
  readonly spotifyArtistId: string | null;
  readonly reach: number | null;
}): Promise<GoldenPathAdmissionDecision> {
  const context = await readGoldenPathTurnContext();
  const decision = decideGoldenPathAdmission({
    ...input,
    goldenPathVerdict: context.verdict,
  });
  if (decision.admit && context.holdReason) {
    return { admit: false, reason: context.holdReason };
  }
  return decision;
}

/**
 * True when this user's waitlist entry was admitted by the golden path, which
 * is account access, not proof of ownership. Read from the persisted decision
 * (users.waitlist_entry_id -> status_reason), so a retried, recovered or
 * already-approved claim treats the artist exactly as the first pass did.
 */
export async function isGoldenPathAdmittedUser(
  appUserId: string
): Promise<boolean> {
  const [row] = await db
    .select({ statusReason: waitlistEntries.statusReason })
    .from(users)
    .innerJoin(waitlistEntries, eq(waitlistEntries.id, users.waitlistEntryId))
    .where(eq(users.id, appUserId))
    .limit(1);
  return row?.statusReason === 'qualified_golden_path_resolved_artist';
}
