import 'server-only';

import { desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { type DbOrTransaction } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { notifySlackWaitlist } from '@/lib/notifications/providers/slack';
import { normalizeEmail } from '@/lib/utils/email';
import { logger } from '@/lib/utils/logger';
import { detectPlatformFromUrl } from '@/lib/utils/social-platform';
import type { WaitlistRequestPayload } from '@/lib/validation/schemas';
import {
  approveWaitlistEntryInTx,
  finalizeWaitlistApproval,
  type WaitlistApprovalResult,
} from '@/lib/waitlist/approval';
import { tryReserveAutoAcceptSlot } from '@/lib/waitlist/settings';

const WAITLIST_LOCK_PREFIX = 'waitlist:';

export type WaitlistAccessOutcome =
  | 'accepted'
  | 'waitlisted_gate_on'
  | 'waitlisted_capacity_full'
  | 'already_waitlisted'
  | 'already_accepted'
  | 'save_failed';

export interface WaitlistAccessRequestInput {
  readonly clerkUserId: string;
  readonly email: string;
  readonly emailRaw?: string;
  readonly fullName: string;
  readonly data: WaitlistRequestPayload;
}

export interface WaitlistAccessRequestResult {
  readonly entryId: string;
  readonly status: 'new' | 'claimed' | 'invited';
  readonly outcome: WaitlistAccessOutcome;
}

const APPROVED_USER_STATUSES = new Set([
  'waitlist_approved',
  'profile_claimed',
  'onboarding_incomplete',
  'active',
]);

// Statuses that strictly succeed `waitlist_approved` — never downgrade them
// when re-affirming approval.
const POST_APPROVAL_USER_STATUSES = new Set([
  'profile_claimed',
  'onboarding_incomplete',
  'active',
]);

function normalizeSpotifyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.protocol = 'https:';
    for (const param of [
      'si',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'nd',
    ]) {
      parsed.searchParams.delete(param);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function buildEntryValues(params: {
  readonly data: WaitlistRequestPayload;
  readonly email: string;
  readonly fullName: string;
}) {
  const { data, email, fullName } = params;
  const { platform, normalizedUrl } = detectPlatformFromUrl(
    data.primarySocialUrl
  );
  const spotifyUrlNormalized = data.spotifyUrl
    ? normalizeSpotifyUrl(data.spotifyUrl)
    : null;

  return {
    fullName,
    email,
    primaryGoal: data.primaryGoal ?? null,
    primarySocialUrl: data.primarySocialUrl,
    primarySocialPlatform: platform,
    primarySocialUrlNormalized: normalizedUrl,
    spotifyUrl: data.spotifyUrl ?? null,
    spotifyUrlNormalized,
    spotifyArtistName: data.spotifyArtistName?.trim() || null,
    heardAbout: data.heardAbout?.trim() || null,
    selectedPlan: data.selectedPlan ?? null,
    updatedAt: new Date(),
    // Store a useful fallback in existing fields without inventing launch scoring.
    primarySocialFollowerCount: null,
  };
}

async function lockWaitlistEmail(
  tx: DbOrTransaction,
  normalizedEmail: string
): Promise<void> {
  const lockKey = WAITLIST_LOCK_PREFIX + normalizedEmail;
  await tx.execute(
    drizzleSql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`
  );
}

async function findLatestEntryByEmail(
  tx: DbOrTransaction,
  normalizedEmail: string
) {
  const [entry] = await tx
    .select({ id: waitlistEntries.id, status: waitlistEntries.status })
    .from(waitlistEntries)
    .where(drizzleSql`lower(${waitlistEntries.email}) = ${normalizedEmail}`)
    .orderBy(desc(waitlistEntries.createdAt))
    .limit(1);

  return entry ?? null;
}

async function upsertUserStatus(params: {
  readonly tx: DbOrTransaction;
  readonly clerkUserId: string;
  readonly emailRaw: string;
  readonly entryId: string;
  readonly nextStatus: 'waitlist_pending' | 'waitlist_approved';
}): Promise<void> {
  const { tx, clerkUserId, emailRaw, entryId, nextStatus } = params;
  const [existing] = await tx
    .select({ id: users.id, userStatus: users.userStatus })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (!existing) {
    await tx.insert(users).values({
      clerkId: clerkUserId,
      email: emailRaw,
      userStatus: nextStatus,
      waitlistEntryId: entryId,
    });
    return;
  }

  // Never downgrade an existing higher-status user.
  // - When trying to set 'waitlist_pending', keep any of the APPROVED_USER_STATUSES.
  // - When trying to set 'waitlist_approved', keep statuses that already imply
  //   the user has progressed past approval (claimed a profile / completing
  //   onboarding / fully active) so we never bump them backwards.
  const shouldKeepStatus =
    nextStatus === 'waitlist_pending'
      ? APPROVED_USER_STATUSES.has(existing.userStatus)
      : POST_APPROVAL_USER_STATUSES.has(existing.userStatus);

  await tx
    .update(users)
    .set({
      email: emailRaw,
      userStatus: shouldKeepStatus ? existing.userStatus : nextStatus,
      waitlistEntryId: entryId,
      updatedAt: new Date(),
    })
    .where(eq(users.id, existing.id));
}

async function tryApproveEntry(
  tx: DbOrTransaction,
  entryId: string
): Promise<WaitlistApprovalResult | null> {
  const approvalResult = await approveWaitlistEntryInTx(tx, entryId);
  if (approvalResult.outcome !== 'approved') return null;
  return approvalResult;
}

async function decideAccess(params: {
  readonly tx: DbOrTransaction;
  readonly entryId: string;
  readonly clerkUserId: string;
  readonly emailRaw: string;
}): Promise<{
  readonly outcome: WaitlistAccessOutcome;
  readonly approval: WaitlistApprovalResult | null;
}> {
  await upsertUserStatus({
    tx: params.tx,
    clerkUserId: params.clerkUserId,
    emailRaw: params.emailRaw,
    entryId: params.entryId,
    nextStatus: 'waitlist_pending',
  });

  const reservation = await tryReserveAutoAcceptSlot(params.tx);

  if (!reservation.shouldAutoAccept) {
    return {
      outcome:
        reservation.reason === 'gate_on'
          ? 'waitlisted_gate_on'
          : 'waitlisted_capacity_full',
      approval: null,
    };
  }

  const approval = await tryApproveEntry(params.tx, params.entryId);
  if (!approval) {
    return { outcome: 'waitlisted_capacity_full', approval: null };
  }

  return { outcome: 'accepted', approval };
}

export async function submitWaitlistAccessRequest(
  input: WaitlistAccessRequestInput
): Promise<WaitlistAccessRequestResult> {
  const normalizedEmail = normalizeEmail(input.email);
  const emailRaw = input.emailRaw ?? input.email;

  const result = await withSystemIngestionSession(
    async tx => {
      await lockWaitlistEmail(tx, normalizedEmail);

      const existing = await findLatestEntryByEmail(tx, normalizedEmail);
      const entryValues = buildEntryValues({
        data: input.data,
        email: normalizedEmail,
        fullName: input.fullName,
      });

      if (existing) {
        if (existing.status === 'claimed' || existing.status === 'invited') {
          await upsertUserStatus({
            tx,
            clerkUserId: input.clerkUserId,
            emailRaw,
            entryId: existing.id,
            nextStatus: 'waitlist_approved',
          });
          return {
            entryId: existing.id,
            status: existing.status,
            outcome: 'already_accepted' as const,
            approval: null as WaitlistApprovalResult | null,
          };
        }

        await tx
          .update(waitlistEntries)
          .set(entryValues)
          .where(eq(waitlistEntries.id, existing.id));

        await upsertUserStatus({
          tx,
          clerkUserId: input.clerkUserId,
          entryId: existing.id,
          emailRaw,
          nextStatus: 'waitlist_pending',
        });

        return {
          entryId: existing.id,
          status: existing.status,
          outcome: 'already_waitlisted' as const,
          approval: null as WaitlistApprovalResult | null,
        };
      }

      const [entry] = await tx
        .insert(waitlistEntries)
        .values({
          ...entryValues,
          status: 'new',
          createdAt: new Date(),
        })
        .returning({ id: waitlistEntries.id });

      if (!entry) {
        throw new Error('Failed to create waitlist entry');
      }

      const decision = await decideAccess({
        tx,
        entryId: entry.id,
        clerkUserId: input.clerkUserId,
        emailRaw,
      });

      return {
        entryId: entry.id,
        status:
          decision.outcome === 'accepted'
            ? ('claimed' as const)
            : ('new' as const),
        outcome: decision.outcome,
        approval: decision.approval,
      };
    },
    { isolationLevel: 'serializable' }
  );

  // Finalize Redis cache invalidation outside the serializable transaction so
  // we don't extend its lock window with non-DB I/O.
  if (result.approval) {
    await finalizeWaitlistApproval(result.approval);
  } else if (result.outcome === 'already_accepted') {
    // The DB already reflects approval (entry status is claimed/invited and
    // userStatus is now waitlist_approved), but the proxy-state Redis cache
    // may still be holding a stale waitlist_pending entry from a prior
    // /waitlist visit. Mirror the normal-approval invalidation so middleware
    // doesn't keep redirecting the user back to /waitlist.
    await invalidateProxyUserStateCache(input.clerkUserId).catch(error => {
      logger.warn(
        '[waitlist] Failed to invalidate proxy state on already_accepted',
        error
      );
    });
  }

  // Suppress Slack pings for outcomes where the user did not transition into a
  // genuinely new waitlist state:
  // - already_waitlisted / already_accepted: not a new signup
  // - waitlisted_capacity_full: daily cap is exhausted, so we'd ping for every
  //   subsequent attempt the rest of the day even though state is unchanged.
  const shouldNotify =
    result.outcome !== 'already_waitlisted' &&
    result.outcome !== 'already_accepted' &&
    result.outcome !== 'waitlisted_capacity_full';
  if (shouldNotify) {
    notifySlackWaitlist(input.fullName, normalizedEmail).catch(error => {
      logger.warn('[waitlist] Slack notification failed', error);
    });
  }

  return {
    entryId: result.entryId,
    status: result.status,
    outcome: result.outcome,
  };
}
