import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { readCachedAcquisitionEligibility } from '@/lib/acquisition/eligibility.server';
import {
  isProofBlockingPublication,
  readClaimVerification,
} from '@/lib/claim/claim-verification';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
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
 * True while this user's page must stay private until ownership is proven.
 * The durable source is the proof-only claim verification stored on the
 * profile (it survives signup, redeem and admin status writes). Before any
 * profile exists, the fresh admission decision on the waitlist entry decides.
 * Once the operator verifies, this is false and the page may be public.
 */
export async function isGoldenPathAdmittedUser(
  appUserId: string
): Promise<boolean> {
  const [profile] = await db
    .select({ settings: creatorProfiles.settings })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, appUserId))
    .orderBy(desc(creatorProfiles.createdAt))
    .limit(1);
  const record = readClaimVerification(profile?.settings);
  if (record?.proofOnly) return record.status !== 'verified';

  const [row] = await db
    .select({ statusReason: waitlistEntries.statusReason })
    .from(users)
    .innerJoin(waitlistEntries, eq(waitlistEntries.id, users.waitlistEntryId))
    .where(eq(users.id, appUserId))
    .limit(1);
  return row?.statusReason === 'qualified_golden_path_resolved_artist';
}

/** Checkout is never offered while a free-admission page is unproven. */
export async function hasProofPendingProfile(
  appUserId: string
): Promise<boolean> {
  const rows = await db
    .select({ settings: creatorProfiles.settings })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, appUserId));
  return rows.some(row => isProofBlockingPublication(row.settings));
}
