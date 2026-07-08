import 'server-only';

import { createHash } from 'node:crypto';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { type DbOrTransaction } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { withSerializableRetry } from '@/lib/db/serializable-retry';
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
import { insertWaitlistAuditLog } from '@/lib/waitlist/audit';
import { enqueueWaitlistEmailJob } from '@/lib/waitlist/email-jobs';
import {
  type InterviewResponses,
  scoreOnboardingInterview,
} from '@/lib/waitlist/interview-scoring';
import {
  evaluateWaitlistQualification,
  type QualificationDecision,
} from '@/lib/waitlist/qualification';
import { getWaitlistSettings } from '@/lib/waitlist/settings';
import {
  isWaitlistApprovedStatus,
  isWaitlistPendingStatus,
  type WaitlistStatus,
} from '@/lib/waitlist/state-machine';
import {
  isStatusUpgrade,
  type UserLifecycleStatus,
} from '@/lib/waitlist/status-precedence';

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
  readonly source?: string;
  /**
   * Free-text answers from the qualifying onboarding interview. When
   * provided, they are scored deterministically and can admit a gate-on
   * signup (`qualified_interview_signal`).
   */
  readonly interviewResponses?: InterviewResponses;
}

export interface WaitlistAccessRequestResult {
  readonly entryId: string;
  readonly status: WaitlistStatus;
  readonly outcome: WaitlistAccessOutcome;
}

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

function hashEmailForWaitlist(email: string): string {
  return createHash('sha256').update(email).digest('hex');
}

function buildQualificationInputs(data: WaitlistRequestPayload) {
  return {
    primaryGoal: data.primaryGoal ?? null,
    primarySocialUrl: data.primarySocialUrl,
    spotifyUrl: data.spotifyUrl ?? null,
    spotifyArtistName: data.spotifyArtistName?.trim() || null,
    heardAbout: data.heardAbout?.trim() || null,
    selectedPlan: data.selectedPlan ?? null,
  };
}

function buildEntryValues(params: {
  readonly data: WaitlistRequestPayload;
  readonly email: string;
  readonly fullName: string;
  readonly source: string;
}) {
  const { data, email, fullName, source } = params;
  const { platform, normalizedUrl } = detectPlatformFromUrl(
    data.primarySocialUrl
  );
  const spotifyUrlNormalized = data.spotifyUrl
    ? normalizeSpotifyUrl(data.spotifyUrl)
    : null;

  return {
    fullName,
    email,
    emailNormalized: email,
    emailHash: hashEmailForWaitlist(email),
    primaryGoal: data.primaryGoal ?? null,
    primarySocialUrl: data.primarySocialUrl,
    primarySocialPlatform: platform,
    primarySocialUrlNormalized: normalizedUrl,
    spotifyUrl: data.spotifyUrl ?? null,
    spotifyUrlNormalized,
    spotifyArtistName: data.spotifyArtistName?.trim() || null,
    heardAbout: data.heardAbout?.trim() || null,
    selectedPlan: data.selectedPlan ?? null,
    source,
    canonical: true,
    qualificationInputs: buildQualificationInputs(data),
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
    .select({
      id: waitlistEntries.id,
      status: waitlistEntries.status,
      waitlistedAt: waitlistEntries.waitlistedAt,
    })
    .from(waitlistEntries)
    .where(
      drizzleSql`${waitlistEntries.emailNormalized} = ${normalizedEmail} OR lower(${waitlistEntries.email}) = ${normalizedEmail}`
    )
    .orderBy(
      drizzleSql`${waitlistEntries.canonical} DESC, ${waitlistEntries.createdAt} DESC`
    )
    .limit(1);

  return entry ?? null;
}

interface UpsertUserStatusResult {
  /** Status the user had before this write (null if user did not exist). */
  readonly previousStatus: string | null;
  /** Status the user has after this write. */
  readonly newStatus: string;
  /** True if the user existed before this call. */
  readonly existed: boolean;
}

async function upsertUserStatus(params: {
  readonly tx: DbOrTransaction;
  readonly clerkUserId: string;
  readonly emailRaw: string;
  readonly entryId: string;
  readonly nextStatus: UserLifecycleStatus;
}): Promise<UpsertUserStatusResult> {
  const { tx, clerkUserId, emailRaw, entryId, nextStatus } = params;
  const email = normalizeEmail(emailRaw);
  const [existing] = await tx
    .select({ id: users.id, userStatus: users.userStatus })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (!existing) {
    await tx.insert(users).values({
      clerkId: clerkUserId,
      email,
      userStatus: nextStatus,
      waitlistEntryId: entryId,
    });
    return {
      previousStatus: null,
      newStatus: nextStatus,
      existed: false,
    };
  }

  // Use the canonical status-precedence rule: never downgrade a
  // higher-ranked status to a lower-ranked one, regardless of which
  // direction we're nominally trying to move. This keeps `active`,
  // `onboarding_incomplete`, `profile_claimed`, `suspended`, and `banned`
  // safe from being reset by a re-submitted waitlist request.
  const upgrade = isStatusUpgrade(existing.userStatus, nextStatus);
  const finalStatus = upgrade ? nextStatus : existing.userStatus;

  await tx
    .update(users)
    .set({
      email,
      userStatus: finalStatus,
      waitlistEntryId: entryId,
      updatedAt: new Date(),
    })
    .where(eq(users.id, existing.id));

  return {
    previousStatus: existing.userStatus,
    newStatus: finalStatus,
    existed: true,
  };
}

async function tryApproveEntry(
  tx: DbOrTransaction,
  entryId: string,
  targetStatus: 'approved' | 'invited',
  reason: string
): Promise<WaitlistApprovalResult | null> {
  const approvalResult = await approveWaitlistEntryInTx(tx, entryId, {
    targetStatus,
    actorType: 'system',
    reason,
  });
  if (approvalResult.outcome !== 'approved') return null;
  return approvalResult;
}

async function decideAccess(params: {
  readonly tx: DbOrTransaction;
  readonly entryId: string;
  readonly clerkUserId: string;
  readonly emailRaw: string;
  readonly email: string;
  readonly data: WaitlistRequestPayload;
  readonly interviewResponses?: InterviewResponses;
}): Promise<{
  readonly outcome: WaitlistAccessOutcome;
  readonly approval: WaitlistApprovalResult | null;
  readonly statusChange: UpsertUserStatusResult;
  readonly qualification: QualificationDecision;
}> {
  const statusChange = await upsertUserStatus({
    tx: params.tx,
    clerkUserId: params.clerkUserId,
    emailRaw: params.emailRaw,
    entryId: params.entryId,
    nextStatus: 'waitlist_pending',
  });

  const settings = await getWaitlistSettings(params.tx);
  const mode = settings.gateEnabled ? 'waitlist_enabled' : 'open_signup';
  const interview = params.interviewResponses
    ? scoreOnboardingInterview({
        payload: params.data,
        responses: params.interviewResponses,
      })
    : null;
  const qualification = evaluateWaitlistQualification({
    email: params.email,
    payload: params.data,
    config: { mode, interview },
  });

  if (qualification.status === 'blocked') {
    return {
      outcome: 'waitlisted_gate_on',
      approval: null,
      statusChange,
      qualification,
    };
  }

  if (qualification.status === 'waitlisted') {
    return {
      outcome: 'waitlisted_gate_on',
      approval: null,
      statusChange,
      qualification,
    };
  }

  const approval = await tryApproveEntry(
    params.tx,
    params.entryId,
    'approved',
    qualification.reasonCode
  );
  if (!approval) {
    const failedQualification: QualificationDecision = {
      ...qualification,
      status: 'waitlisted',
      reasonCode: 'waitlist_capacity_full',
      details: {
        ...qualification.details,
        approval: 'failed',
      },
    };
    return {
      outcome: 'waitlisted_capacity_full',
      approval: null,
      statusChange,
      qualification: failedQualification,
    };
  }

  return { outcome: 'accepted', approval, statusChange, qualification };
}

interface InternalTransactionResult {
  readonly entryId: string;
  readonly status: WaitlistStatus;
  readonly outcome: WaitlistAccessOutcome;
  readonly approval: WaitlistApprovalResult | null;
  readonly statusChange: UpsertUserStatusResult;
}

async function handleExistingEntryResubmission(params: {
  readonly tx: DbOrTransaction;
  readonly existing: NonNullable<
    Awaited<ReturnType<typeof findLatestEntryByEmail>>
  >;
  readonly entryValues: ReturnType<typeof buildEntryValues>;
  readonly clerkUserId: string;
  readonly emailRaw: string;
}): Promise<InternalTransactionResult> {
  const { tx, existing, entryValues, clerkUserId, emailRaw } = params;

  if (isWaitlistApprovedStatus(existing.status)) {
    const statusChange = await upsertUserStatus({
      tx,
      clerkUserId,
      emailRaw,
      entryId: existing.id,
      nextStatus: 'waitlist_approved',
    });
    return {
      entryId: existing.id,
      status: existing.status,
      outcome: 'already_accepted',
      approval: null,
      statusChange,
    };
  }

  const nextExistingStatus =
    isWaitlistPendingStatus(existing.status) || existing.status === 'expired'
      ? 'waitlisted'
      : existing.status;

  await tx
    .update(waitlistEntries)
    .set({
      ...entryValues,
      qualificationResult: {
        status: 'waitlisted',
        reasonCode: 'already_waitlisted',
      },
      status: nextExistingStatus,
      statusReason: 'already_waitlisted',
      waitlistedAt: existing.waitlistedAt ?? new Date(),
    })
    .where(eq(waitlistEntries.id, existing.id));

  const statusChange = await upsertUserStatus({
    tx,
    clerkUserId,
    entryId: existing.id,
    emailRaw,
    nextStatus: 'waitlist_pending',
  });

  return {
    entryId: existing.id,
    status: nextExistingStatus,
    outcome: 'already_waitlisted',
    approval: null,
    statusChange,
  };
}

export async function submitWaitlistAccessRequest(
  input: WaitlistAccessRequestInput
): Promise<WaitlistAccessRequestResult> {
  const normalizedEmail = normalizeEmail(input.email);
  const emailRaw = input.emailRaw ?? input.email;

  // Wrap the serializable transaction with bounded retry on transient
  // 40001/40P01 conflicts. This block must be idempotent; the transaction
  // takes a per-email advisory lock as its first statement so retried
  // attempts re-serialize cleanly.
  const result = await withSerializableRetry<InternalTransactionResult>(() =>
    withSystemIngestionSession(
      async tx => {
        await lockWaitlistEmail(tx, normalizedEmail);

        const existing = await findLatestEntryByEmail(tx, normalizedEmail);
        const entryValues = buildEntryValues({
          data: input.data,
          email: normalizedEmail,
          fullName: input.fullName,
          source: input.source ?? 'waitlist_form',
        });

        if (existing) {
          return handleExistingEntryResubmission({
            tx,
            existing,
            entryValues,
            clerkUserId: input.clerkUserId,
            emailRaw,
          });
        }

        const [entry] = await tx
          .insert(waitlistEntries)
          .values({
            ...entryValues,
            status: 'chat_started',
            statusReason: 'chat_started',
            createdAt: new Date(),
          })
          .onConflictDoNothing({
            target: waitlistEntries.emailNormalized,
            where: drizzleSql`${waitlistEntries.canonical} = true`,
          })
          .returning({ id: waitlistEntries.id });

        if (!entry) {
          const concurrentExisting = await findLatestEntryByEmail(
            tx,
            normalizedEmail
          );
          if (concurrentExisting) {
            return handleExistingEntryResubmission({
              tx,
              existing: concurrentExisting,
              entryValues,
              clerkUserId: input.clerkUserId,
              emailRaw,
            });
          }

          throw new Error('Failed to create waitlist entry');
        }

        const decision = await decideAccess({
          tx,
          entryId: entry.id,
          clerkUserId: input.clerkUserId,
          emailRaw,
          email: normalizedEmail,
          data: input.data,
          interviewResponses: input.interviewResponses,
        });

        const nextStatus = decision.qualification.status;
        const now = new Date();
        await tx
          .update(waitlistEntries)
          .set({
            status: nextStatus,
            statusReason: decision.qualification.reasonCode,
            qualificationResult: {
              qualified: decision.qualification.qualified,
              status: decision.qualification.status,
              reasonCode: decision.qualification.reasonCode,
              details: decision.qualification.details,
            },
            qualifiedAt: decision.qualification.qualified ? now : null,
            waitlistedAt: nextStatus === 'waitlisted' ? now : null,
            approvedAt: nextStatus === 'approved' ? now : undefined,
            blockedAt: nextStatus === 'blocked' ? now : null,
            updatedAt: now,
          })
          .where(eq(waitlistEntries.id, entry.id));

        await insertWaitlistAuditLog(tx, {
          waitlistEntryId: entry.id,
          fromStatus: 'chat_started',
          toStatus: nextStatus,
          actorUserId: input.clerkUserId,
          actorType: 'user',
          reason: decision.qualification.reasonCode,
          metadata: decision.qualification.details,
        });

        if (nextStatus === 'waitlisted') {
          await enqueueWaitlistEmailJob(tx, {
            entryId: entry.id,
            type: 'waitlist_confirmation',
          });
        }

        return {
          entryId: entry.id,
          status: nextStatus,
          outcome: decision.outcome,
          approval: decision.approval,
          statusChange: decision.statusChange,
        };
      },
      { isolationLevel: 'serializable' }
    )
  );

  // True if the user's `userStatus` actually moved between previous and new
  // values inside the transaction. Idempotent re-submits where status was
  // pinned by the precedence guard return false here, so we don't bust the
  // proxy-state cache or re-fire Slack on no-op writes.
  const statusActuallyChanged =
    result.statusChange.previousStatus !== result.statusChange.newStatus;

  // Finalize Redis cache invalidation outside the serializable transaction so
  // we don't extend its lock window with non-DB I/O.
  if (result.approval) {
    await finalizeWaitlistApproval(result.approval);
  } else if (result.outcome === 'already_accepted' && statusActuallyChanged) {
    // The DB already reflects approval (entry status is claimed/invited and
    // userStatus is now waitlist_approved), but the proxy-state Redis cache
    // may still be holding a stale waitlist_pending entry from a prior
    // /waitlist visit. Mirror the normal-approval invalidation so middleware
    // doesn't keep redirecting the user back to /waitlist.
    //
    // Only bust the cache when the userStatus row actually changed; otherwise
    // we'd thrash the cache on every idempotent re-assert.
    await invalidateProxyUserStateCache(input.clerkUserId).catch(error => {
      logger.warn(
        '[waitlist] Failed to invalidate proxy state on already_accepted',
        error
      );
    });
  }

  // Slack idempotency: only ping on a true new-state transition. Suppress for
  // outcomes where the user did not transition into a genuinely new waitlist
  // state, AND for any retried waitlist_pending write where the user already
  // existed and the status didn't change.
  const isNewSignupOutcome =
    result.outcome !== 'already_waitlisted' &&
    result.outcome !== 'already_accepted' &&
    result.outcome !== 'waitlisted_capacity_full';
  // For outcomes that count as a signup, additionally require that the row
  // is genuinely new OR the user moved into a higher-rank status. This
  // guards against an obscure case where two near-simultaneous requests for
  // a returning user with a stale entry could both produce
  // `waitlisted_gate_on` despite no real state change.
  const isStatusFreshlyAssigned =
    !result.statusChange.existed || statusActuallyChanged;
  if (isNewSignupOutcome && isStatusFreshlyAssigned) {
    notifySlackWaitlist(input.fullName, normalizedEmail).catch(error => {
      logger.warn('[waitlist] Slack notification failed', error);
    });
  }

  logger.info('[waitlist] Access request processed', {
    entryId: result.entryId,
    outcome: result.outcome,
    status: result.status,
    source: input.source ?? 'waitlist_form',
  });

  return {
    entryId: result.entryId,
    status: result.status,
    outcome: result.outcome,
  };
}
