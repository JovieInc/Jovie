import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { readCachedAcquisitionEligibility } from '@/lib/acquisition/eligibility.server';
import {
  isProofBlockingPublication,
  isRecordBlockingPublication,
  readClaimVerification,
} from '@/lib/claim/claim-verification';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistAuditLogs } from '@/lib/db/schema/waitlist';
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
 * Fail closed: a self-picked artist identity needs proof unless an operator
 * already vouched for it. Two things count as operator proof: the operator
 * verified the claim (the durable proof-only record on the profile), or an
 * admin approved the waitlist entry. Every other route (golden path, the
 * auto-accept drain, invite redemption, interview or open-signup admission)
 * needs proof, including reasons added later.
 */
export async function requiresProofBeforePublic(
  appUserId: string
): Promise<boolean> {
  const profiles = await db
    .select({ settings: creatorProfiles.settings })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, appUserId))
    .orderBy(desc(creatorProfiles.createdAt));
  const records = profiles
    .map(profile => readClaimVerification(profile.settings))
    .filter(record => record?.proofOnly === true);
  if (records.length > 0) {
    return records.some(record => isRecordBlockingPublication(record));
  }

  const [adminApproval] = await db
    .select({ id: waitlistAuditLogs.id })
    .from(users)
    .innerJoin(
      waitlistAuditLogs,
      eq(waitlistAuditLogs.waitlistEntryId, users.waitlistEntryId)
    )
    .where(
      and(
        eq(users.id, appUserId),
        eq(waitlistAuditLogs.actorType, 'admin'),
        inArray(waitlistAuditLogs.toStatus, ['approved', 'invited'])
      )
    )
    .limit(1);
  return !adminApproval;
}

/** True while any of the user's profiles is private awaiting proof. */
export async function hasProofPendingProfile(
  appUserId: string
): Promise<boolean> {
  const rows = await db
    .select({ settings: creatorProfiles.settings })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, appUserId));
  return rows.some(row => isProofBlockingPublication(row.settings));
}
