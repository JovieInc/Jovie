import 'server-only';

import { sql as drizzleSql, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTransaction } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { ingestionJobs } from '@/lib/db/schema/ingestion';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { sendNotification } from '@/lib/notifications/service';
import { logger } from '@/lib/utils/logger';
import { decryptPII, encryptPII } from '@/lib/utils/pii-encryption';
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
import {
  generateWaitlistInviteTokenPair,
  hashWaitlistInviteToken,
  type WaitlistInviteTokenPair,
} from '@/lib/waitlist/tokens';
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
  encryptedInviteToken: z.string().min(32).optional(),
});

export type WaitlistEmailType = z.infer<typeof waitlistEmailTypeSchema>;
export type WaitlistEmailJobPayload = z.input<
  typeof waitlistEmailJobPayloadSchema
>;

function encryptInviteTokenForJob(token: string): string {
  const encryptedToken = encryptPII(token);
  if (!encryptedToken) {
    throw new Error('Failed to encrypt waitlist invite token');
  }
  return encryptedToken;
}

function decryptInviteTokenForJob(encryptedToken: string): string {
  const token = decryptPII(encryptedToken);
  if (!token) {
    throw new Error('Failed to decrypt waitlist invite token');
  }
  return token;
}

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

async function issueWaitlistInviteToken(
  tx: DbOrTransaction,
  entryId: string,
  options: { force?: boolean; now?: Date } = {}
): Promise<WaitlistInviteTokenPair | null> {
  const now = options.now ?? new Date();
  const [entry] = await tx
    .select({
      id: waitlistEntries.id,
      status: waitlistEntries.status,
      inviteTokenHash: waitlistEntries.inviteTokenHash,
      inviteTokenExpiresAt: waitlistEntries.inviteTokenExpiresAt,
    })
    .from(waitlistEntries)
    .where(eq(waitlistEntries.id, entryId))
    .for('update')
    .limit(1);

  if (!entry || !isWaitlistInviteRedeemableStatus(entry.status)) {
    return null;
  }

  if (
    entry.inviteTokenHash &&
    entry.inviteTokenExpiresAt &&
    entry.inviteTokenExpiresAt.getTime() > now.getTime() &&
    !options.force
  ) {
    return null;
  }

  const tokenPair = generateWaitlistInviteTokenPair(now);
  await tx
    .update(waitlistEntries)
    .set({
      inviteTokenHash: tokenPair.tokenHash,
      inviteTokenExpiresAt: tokenPair.expiresAt,
      inviteTokenRedeemedAt: null,
      updatedAt: now,
    })
    .where(eq(waitlistEntries.id, entry.id));

  return tokenPair;
}

export async function enqueueWaitlistApprovalInviteEmail(
  tx: DbOrTransaction,
  entryId: string,
  options: {
    force?: boolean;
    runAt?: Date;
    priority?: number;
    maxAttempts?: number;
    dedupScope?: string;
    now?: Date;
  } = {}
): Promise<string | null> {
  const tokenPair = await issueWaitlistInviteToken(tx, entryId, options);
  if (!tokenPair) return null;

  return enqueueWaitlistEmailJob(
    tx,
    {
      entryId,
      type: 'approval_invite',
      force: options.force,
      encryptedInviteToken: encryptInviteTokenForJob(tokenPair.token),
    },
    {
      runAt: options.runAt,
      priority: options.priority,
      maxAttempts: options.maxAttempts,
      dedupScope: options.dedupScope ?? `token:${tokenPair.tokenHash}`,
    }
  );
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

async function scrubInviteTokenFromJobPayload(params: {
  tx: DbOrTransaction;
  jobId: string | undefined;
  payload: z.infer<typeof waitlistEmailJobPayloadSchema>;
}) {
  if (
    !params.jobId ||
    params.payload.type !== 'approval_invite' ||
    !params.payload.encryptedInviteToken
  ) {
    return;
  }

  await params.tx
    .update(ingestionJobs)
    .set({
      payload: {
        entryId: params.payload.entryId,
        type: params.payload.type,
        force: params.payload.force,
      },
      updatedAt: new Date(),
    })
    .where(eq(ingestionJobs.id, params.jobId));
}

export interface WaitlistEmailJobResult {
  entryId: string;
  type: WaitlistEmailType;
  status: 'sent' | 'skipped' | 'error';
  detail?: string;
}

export async function processWaitlistEmailJob(
  tx: DbOrTransaction,
  rawPayload: unknown,
  options: { jobId?: string } = {}
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
      inviteTokenHash: waitlistEntries.inviteTokenHash,
      inviteTokenExpiresAt: waitlistEntries.inviteTokenExpiresAt,
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
    if (payload.encryptedInviteToken) {
      rawToken = decryptInviteTokenForJob(payload.encryptedInviteToken);
      const payloadTokenHash = hashWaitlistInviteToken(rawToken);
      if (entry.inviteTokenHash && entry.inviteTokenHash !== payloadTokenHash) {
        const detail = 'Stale approval invite job skipped';
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
        entry.inviteTokenExpiresAt &&
        entry.inviteTokenExpiresAt.getTime() <= now.getTime()
      ) {
        const detail = 'Queued approval invite token expired; resend invite';
        await markEntryEmailResult({
          tx,
          entryId: entry.id,
          type: payload.type,
          result: { channel: 'email', status: 'error', error: detail },
        });
        throw new Error(detail);
      }

      if (!entry.inviteTokenHash || !entry.inviteTokenExpiresAt) {
        const tokenPair = generateWaitlistInviteTokenPair(now);
        await tx
          .update(waitlistEntries)
          .set({
            inviteTokenHash: payloadTokenHash,
            inviteTokenExpiresAt: tokenPair.expiresAt,
            inviteTokenRedeemedAt: null,
            updatedAt: now,
          })
          .where(eq(waitlistEntries.id, entry.id));
      }
    } else {
      if (
        entry.inviteTokenHash &&
        entry.inviteTokenExpiresAt &&
        entry.inviteTokenExpiresAt.getTime() > now.getTime() &&
        !payload.force
      ) {
        const detail =
          'Approval invite token already issued; use resend invite to rotate it';
        await markEntryEmailResult({
          tx,
          entryId: entry.id,
          type: payload.type,
          result: { channel: 'email', status: 'error', error: detail },
        });
        throw new Error(detail);
      }

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

  if (payload.type === 'approval_invite' && rawToken) {
    email.message.idempotencyKey = `waitlist_invite:${entry.id}:${hashWaitlistInviteToken(rawToken)}`;
  }

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

  await scrubInviteTokenFromJobPayload({
    tx,
    jobId: options.jobId,
    payload,
  });

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
