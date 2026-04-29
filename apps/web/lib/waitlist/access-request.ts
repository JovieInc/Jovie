import 'server-only';

import { desc, sql as drizzleSql, eq } from 'drizzle-orm';
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
} from '@/lib/waitlist/approval';
import { tryReserveAutoAcceptSlot } from '@/lib/waitlist/settings';

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
  await tx.execute(
    drizzleSql`SELECT pg_advisory_xact_lock(hashtext(${`waitlist:${normalizedEmail}`}))`
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

  const shouldKeepStatus =
    nextStatus === 'waitlist_pending' &&
    APPROVED_USER_STATUSES.has(existing.userStatus);

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

async function approveEntryForAccess(
  tx: DbOrTransaction,
  entryId: string
): Promise<boolean> {
  const approvalResult = await approveWaitlistEntryInTx(tx, entryId);

  if (approvalResult.outcome !== 'approved') {
    return false;
  }

  await finalizeWaitlistApproval(approvalResult);
  return true;
}

async function decideAccess(params: {
  readonly tx: DbOrTransaction;
  readonly entryId: string;
  readonly clerkUserId: string;
  readonly emailRaw: string;
}): Promise<WaitlistAccessOutcome> {
  await upsertUserStatus({
    tx: params.tx,
    clerkUserId: params.clerkUserId,
    emailRaw: params.emailRaw,
    entryId: params.entryId,
    nextStatus: 'waitlist_pending',
  });

  const reservation = await tryReserveAutoAcceptSlot(params.tx);

  if (!reservation.shouldAutoAccept) {
    return reservation.reason === 'gate_on'
      ? 'waitlisted_gate_on'
      : 'waitlisted_capacity_full';
  }

  const approved = await approveEntryForAccess(params.tx, params.entryId);
  if (!approved) {
    return 'waitlisted_capacity_full';
  }

  return 'accepted';
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

      const outcome = await decideAccess({
        tx,
        entryId: entry.id,
        clerkUserId: input.clerkUserId,
        emailRaw,
      });

      return {
        entryId: entry.id,
        status:
          outcome === 'accepted' ? ('claimed' as const) : ('new' as const),
        outcome,
      };
    },
    { isolationLevel: 'serializable' }
  );

  if (
    result.outcome !== 'already_waitlisted' &&
    result.outcome !== 'already_accepted'
  ) {
    notifySlackWaitlist(input.fullName, normalizedEmail).catch(error => {
      logger.warn('[waitlist] Slack notification failed', error);
    });
  }

  return result;
}
