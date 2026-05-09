import 'server-only';

import { sql as drizzleSql, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTransaction } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { ingestionJobs } from '@/lib/db/schema/ingestion';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { sendNotification } from '@/lib/notifications/service';
import { logger } from '@/lib/utils/logger';
import {
  buildWaitlistConfirmationEmail,
  buildWaitlistInviteEmail,
  buildWaitlistWelcomeEmail,
} from '@/lib/waitlist/invite';
import {
  isWaitlistInviteRedeemableStatus,
  shouldSendWaitlistConfirmationForStatus,
  shouldSendWaitlistWelcomeForStatus,
} from '@/lib/waitlist/state-machine';
import { generateWaitlistInviteTokenPair } from '@/lib/waitlist/tokens';
import type { NotificationChannelResult } from '@/types/notifications';

export const waitlistEmailTypeSchema = z.enum([
  'waitlist_confirmation',
  'approval_invite',
  'welcome',
]);

export const waitlistEmailJobPayloadSchema = z.object({
  entryId: z.string().uuid(),
  type: waitlistEmailTypeSchema,
  force: z.boolean().optional().default(false),
});

export type WaitlistEmailType = z.infer<typeof waitlistEmailTypeSchema>;
export type WaitlistEmailJobPayload = z.input<
  typeof waitlistEmailJobPayloadSchema
>;

export async function enqueueWaitlistEmailJob(
  tx: DbOrTransaction,
  payload: WaitlistEmailJobPayload,
  options: {
    runAt?: Date;
    priority?: number;
    maxAttempts?: number;
    dedupScope?: string;
  } = {}
): Promise<string> {
  const {
    runAt = new Date(),
    priority = payload.type === 'welcome' ? 1 : 0,
    maxAttempts = 3,
    dedupScope,
  } = options;
  const dedupKey = `waitlist_email:${payload.type}:${payload.entryId}${
    dedupScope ? `:${dedupScope}` : ''
  }`;

  const [job] = await tx
    .insert(ingestionJobs)
    .values({
      jobType: 'send_waitlist_email',
      payload,
      status: 'pending',
      runAt,
      priority,
      maxAttempts,
      dedupKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: ingestionJobs.id });

  if (job) return job.id;
  return dedupKey;
}

function getEmailResult(
  results: readonly NotificationChannelResult[]
): NotificationChannelResult {
  return (
    results.find(result => result.channel === 'email') ?? {
      channel: 'email',
      status: 'error',
      error: 'Email channel did not return a result',
    }
  );
}

function getProviderMessageId(
  result: NotificationChannelResult
): string | null {
  return result.status === 'sent' ? (result.detail ?? null) : null;
}

function getEmailError(result: NotificationChannelResult): string | null {
  if (result.status === 'error') return result.error ?? 'Unknown email error';
  if (result.status === 'skipped') return result.detail ?? 'Email skipped';
  return null;
}

async function markEntryEmailResult(params: {
  tx: DbOrTransaction;
  entryId: string;
  type: WaitlistEmailType;
  result: NotificationChannelResult;
}) {
  const now = new Date();
  const providerMessageId = getProviderMessageId(params.result);
  const error = getEmailError(params.result);

  if (params.type === 'waitlist_confirmation') {
    await params.tx
      .update(waitlistEntries)
      .set({
        waitlistEmailStatus: params.result.status,
        waitlistEmailProviderMessageId: providerMessageId,
        waitlistEmailLastError: error,
        waitlistEmailSentAt: params.result.status === 'sent' ? now : undefined,
        updatedAt: now,
      })
      .where(eq(waitlistEntries.id, params.entryId));
    return;
  }

  if (params.type === 'approval_invite') {
    await params.tx
      .update(waitlistEntries)
      .set({
        inviteEmailStatus: params.result.status,
        inviteEmailProviderMessageId: providerMessageId,
        inviteEmailLastError: error,
        inviteEmailSentAt: params.result.status === 'sent' ? now : undefined,
        updatedAt: now,
      })
      .where(eq(waitlistEntries.id, params.entryId));
    return;
  }
}

export interface WaitlistEmailJobResult {
  entryId: string;
  type: WaitlistEmailType;
  status: 'sent' | 'skipped' | 'error';
  detail?: string;
}

export async function processWaitlistEmailJob(
  tx: DbOrTransaction,
  rawPayload: unknown
): Promise<WaitlistEmailJobResult> {
  const payload = waitlistEmailJobPayloadSchema.parse(rawPayload);
  const now = new Date();

  const [entry] = await tx
    .select({
      id: waitlistEntries.id,
      email: waitlistEntries.email,
      fullName: waitlistEntries.fullName,
      status: waitlistEntries.status,
      waitlistEmailSentAt: waitlistEntries.waitlistEmailSentAt,
      inviteEmailSentAt: waitlistEntries.inviteEmailSentAt,
    })
    .from(waitlistEntries)
    .where(eq(waitlistEntries.id, payload.entryId))
    .for('update')
    .limit(1);

  if (!entry) {
    throw new Error(`Waitlist entry not found: ${payload.entryId}`);
  }

  if (
    payload.type === 'waitlist_confirmation' &&
    entry.waitlistEmailSentAt &&
    !payload.force
  ) {
    return {
      entryId: entry.id,
      type: payload.type,
      status: 'skipped',
      detail: 'Waitlist confirmation already sent',
    };
  }

  if (
    payload.type === 'waitlist_confirmation' &&
    !shouldSendWaitlistConfirmationForStatus(entry.status)
  ) {
    const detail = `Waitlist confirmation skipped for status ${entry.status}`;
    await markEntryEmailResult({
      tx,
      entryId: entry.id,
      type: payload.type,
      result: { channel: 'email', status: 'skipped', detail },
    });
    return {
      entryId: entry.id,
      type: payload.type,
      status: 'skipped',
      detail,
    };
  }

  if (
    payload.type === 'approval_invite' &&
    entry.inviteEmailSentAt &&
    !payload.force
  ) {
    return {
      entryId: entry.id,
      type: payload.type,
      status: 'skipped',
      detail: 'Approval invite already sent',
    };
  }

  if (
    payload.type === 'approval_invite' &&
    !isWaitlistInviteRedeemableStatus(entry.status)
  ) {
    const detail = `Approval invite skipped for status ${entry.status}`;
    await markEntryEmailResult({
      tx,
      entryId: entry.id,
      type: payload.type,
      result: { channel: 'email', status: 'skipped', detail },
    });
    return {
      entryId: entry.id,
      type: payload.type,
      status: 'skipped',
      detail,
    };
  }

  let rawToken: string | null = null;
  if (payload.type === 'approval_invite') {
    const tokenPair = generateWaitlistInviteTokenPair(now);
    rawToken = tokenPair.token;
    await tx
      .update(waitlistEntries)
      .set({
        inviteTokenHash: tokenPair.tokenHash,
        inviteTokenExpiresAt: tokenPair.expiresAt,
        inviteTokenRedeemedAt: null,
        updatedAt: now,
      })
      .where(eq(waitlistEntries.id, entry.id));
  }

  if (payload.type === 'waitlist_confirmation') {
    await tx
      .update(waitlistEntries)
      .set({ waitlistEmailStatus: 'sending', updatedAt: now })
      .where(eq(waitlistEntries.id, entry.id));
  } else if (payload.type === 'approval_invite') {
    await tx
      .update(waitlistEntries)
      .set({ inviteEmailStatus: 'sending', updatedAt: now })
      .where(eq(waitlistEntries.id, entry.id));
  }

  if (payload.type === 'welcome') {
    if (!shouldSendWaitlistWelcomeForStatus(entry.status)) {
      return {
        entryId: entry.id,
        type: payload.type,
        status: 'skipped',
        detail: `Welcome email skipped for status ${entry.status}`,
      };
    }

    const [user] = await tx
      .select({
        id: users.id,
        founderWelcomeSentAt: users.founderWelcomeSentAt,
      })
      .from(users)
      .where(
        or(
          eq(users.waitlistEntryId, entry.id),
          drizzleSql`lower(${users.email}) = lower(${entry.email})`
        )
      )
      .limit(1);

    if (!user) {
      throw new Error(`User not found for waitlist entry: ${entry.id}`);
    }

    if (user.founderWelcomeSentAt && !payload.force) {
      return {
        entryId: entry.id,
        type: payload.type,
        status: 'skipped',
        detail: 'Welcome email already sent',
      };
    }

    const { message, target } = buildWaitlistWelcomeEmail({
      email: entry.email,
      fullName: entry.fullName,
      dedupKey: `waitlist_welcome:${entry.id}`,
    });
    const dispatch = await sendNotification(message, target);
    const emailResult = getEmailResult(dispatch.results);

    if (emailResult.status === 'sent') {
      await tx
        .update(users)
        .set({
          founderWelcomeSentAt: now,
          welcomeFailedAt: null,
          updatedAt: now,
        })
        .where(eq(users.id, user.id));
      return {
        entryId: entry.id,
        type: payload.type,
        status: 'sent',
        detail: emailResult.detail,
      };
    }

    await tx
      .update(users)
      .set({ welcomeFailedAt: now, updatedAt: now })
      .where(eq(users.id, user.id));
    const error = getEmailError(emailResult) ?? 'Welcome email failed';
    throw new Error(error);
  }

  const email =
    payload.type === 'waitlist_confirmation'
      ? buildWaitlistConfirmationEmail({
          email: entry.email,
          fullName: entry.fullName,
          dedupKey: `waitlist_confirmation:${entry.id}`,
        })
      : buildWaitlistInviteEmail({
          email: entry.email,
          fullName: entry.fullName,
          token: rawToken ?? undefined,
          dedupKey: `waitlist_invite:${entry.id}`,
        });

  const dispatch = await sendNotification(email.message, email.target);
  const emailResult = getEmailResult(dispatch.results);
  await markEntryEmailResult({
    tx,
    entryId: entry.id,
    type: payload.type,
    result: emailResult,
  });

  if (emailResult.status !== 'sent') {
    const error = getEmailError(emailResult) ?? 'Waitlist email failed';
    logger.warn('[waitlist] Email job failed', {
      entryId: entry.id,
      type: payload.type,
      status: emailResult.status,
      detail: error,
    });
    throw new Error(error);
  }

  return {
    entryId: entry.id,
    type: payload.type,
    status: 'sent',
    detail: emailResult.detail,
  };
}

export async function enqueueSignedUpWelcomeEmail(
  tx: DbOrTransaction,
  entryId: string
): Promise<void> {
  await enqueueWaitlistEmailJob(tx, {
    entryId,
    type: 'welcome',
  });
}
