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

type ParsedWaitlistEmailJobPayload = z.infer<
  typeof waitlistEmailJobPayloadSchema
>;

type LockedWaitlistEmailEntry = {
  id: string;
  email: string;
  fullName: string;
  status: string;
  waitlistEmailSentAt: Date | null;
  inviteEmailSentAt: Date | null;
  inviteTokenHash: string | null;
  inviteTokenExpiresAt: Date | null;
};

function skippedWaitlistEmailResult(params: {
  entryId: string;
  type: WaitlistEmailType;
  detail: string;
}): WaitlistEmailJobResult {
  return {
    entryId: params.entryId,
    type: params.type,
    status: 'skipped',
    detail: params.detail,
  };
}

async function lockAndFetchEntry(
  tx: DbOrTransaction,
  entryId: string
): Promise<LockedWaitlistEmailEntry> {
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
    .where(eq(waitlistEntries.id, entryId))
    .for('update')
    .limit(1);

  if (!entry) {
    throw new Error(`Waitlist entry not found: ${entryId}`);
  }

  return entry;
}

async function markEmailSending(params: {
  tx: DbOrTransaction;
  entryId: string;
  type: 'waitlist_confirmation' | 'approval_invite';
  now: Date;
}) {
  if (params.type === 'waitlist_confirmation') {
    await params.tx
      .update(waitlistEntries)
      .set({ waitlistEmailStatus: 'sending', updatedAt: params.now })
      .where(eq(waitlistEntries.id, params.entryId));
    return;
  }

  await params.tx
    .update(waitlistEntries)
    .set({ inviteEmailStatus: 'sending', updatedAt: params.now })
    .where(eq(waitlistEntries.id, params.entryId));
}

async function sendAndRecordWaitlistEmail(params: {
  tx: DbOrTransaction;
  entryId: string;
  type: 'waitlist_confirmation' | 'approval_invite';
  message: Parameters<typeof sendNotification>[0];
  target: Parameters<typeof sendNotification>[1];
}): Promise<WaitlistEmailJobResult> {
  const dispatch = await sendNotification(params.message, params.target);
  const emailResult = getEmailResult(dispatch.results);
  await markEntryEmailResult({
    tx: params.tx,
    entryId: params.entryId,
    type: params.type,
    result: emailResult,
  });

  if (emailResult.status !== 'sent') {
    const error = getEmailError(emailResult) ?? 'Waitlist email failed';
    logger.warn('[waitlist] Email job failed', {
      entryId: params.entryId,
      type: params.type,
      status: emailResult.status,
      detail: error,
    });
    throw new Error(error);
  }

  return {
    entryId: params.entryId,
    type: params.type,
    status: 'sent',
    detail: emailResult.detail,
  };
}

async function processWaitlistConfirmationEmail(params: {
  tx: DbOrTransaction;
  payload: ParsedWaitlistEmailJobPayload;
  entry: LockedWaitlistEmailEntry;
  now: Date;
}): Promise<WaitlistEmailJobResult> {
  const { tx, payload, entry, now } = params;

  if (entry.waitlistEmailSentAt && !payload.force) {
    return skippedWaitlistEmailResult({
      entryId: entry.id,
      type: payload.type,
      detail: 'Waitlist confirmation already sent',
    });
  }

  if (!shouldSendWaitlistConfirmationForStatus(entry.status)) {
    const detail = `Waitlist confirmation skipped for status ${entry.status}`;
    await markEntryEmailResult({
      tx,
      entryId: entry.id,
      type: payload.type,
      result: { channel: 'email', status: 'skipped', detail },
    });
    return skippedWaitlistEmailResult({
      entryId: entry.id,
      type: payload.type,
      detail,
    });
  }

  await markEmailSending({
    tx,
    entryId: entry.id,
    type: 'waitlist_confirmation',
    now,
  });
  const { message, target } = buildWaitlistConfirmationEmail({
    email: entry.email,
    fullName: entry.fullName,
    dedupKey: `waitlist_confirmation:${entry.id}`,
  });

  return sendAndRecordWaitlistEmail({
    tx,
    entryId: entry.id,
    type: 'waitlist_confirmation',
    message,
    target,
  });
}

async function resolveApprovalInviteToken(params: {
  tx: DbOrTransaction;
  payload: ParsedWaitlistEmailJobPayload;
  entry: LockedWaitlistEmailEntry;
  now: Date;
}): Promise<string | WaitlistEmailJobResult> {
  const { tx, payload, entry, now } = params;

  if (payload.encryptedInviteToken) {
    const rawToken = decryptInviteTokenForJob(payload.encryptedInviteToken);
    const payloadTokenHash = hashWaitlistInviteToken(rawToken);

    if (entry.inviteTokenHash && entry.inviteTokenHash !== payloadTokenHash) {
      const detail = 'Stale approval invite job skipped';
      await markEntryEmailResult({
        tx,
        entryId: entry.id,
        type: payload.type,
        result: { channel: 'email', status: 'skipped', detail },
      });
      return skippedWaitlistEmailResult({
        entryId: entry.id,
        type: payload.type,
        detail,
      });
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

    return rawToken;
  }

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
  await tx
    .update(waitlistEntries)
    .set({
      inviteTokenHash: tokenPair.tokenHash,
      inviteTokenExpiresAt: tokenPair.expiresAt,
      inviteTokenRedeemedAt: null,
      updatedAt: now,
    })
    .where(eq(waitlistEntries.id, entry.id));

  return tokenPair.token;
}

async function processApprovalInviteEmail(params: {
  tx: DbOrTransaction;
  payload: ParsedWaitlistEmailJobPayload;
  entry: LockedWaitlistEmailEntry;
  now: Date;
  jobId?: string;
}): Promise<WaitlistEmailJobResult> {
  const { tx, payload, entry, now, jobId } = params;

  if (entry.inviteEmailSentAt && !payload.force) {
    return skippedWaitlistEmailResult({
      entryId: entry.id,
      type: payload.type,
      detail: 'Approval invite already sent',
    });
  }

  if (!isWaitlistInviteRedeemableStatus(entry.status)) {
    const detail = `Approval invite skipped for status ${entry.status}`;
    await markEntryEmailResult({
      tx,
      entryId: entry.id,
      type: payload.type,
      result: { channel: 'email', status: 'skipped', detail },
    });
    return skippedWaitlistEmailResult({
      entryId: entry.id,
      type: payload.type,
      detail,
    });
  }

  const tokenResult = await resolveApprovalInviteToken({
    tx,
    payload,
    entry,
    now,
  });
  if (typeof tokenResult !== 'string') {
    return tokenResult;
  }

  await markEmailSending({
    tx,
    entryId: entry.id,
    type: 'approval_invite',
    now,
  });
  const { message, target } = buildWaitlistInviteEmail({
    email: entry.email,
    fullName: entry.fullName,
    token: tokenResult,
    dedupKey: `waitlist_invite:${entry.id}`,
  });
  message.idempotencyKey = `waitlist_invite:${entry.id}:${hashWaitlistInviteToken(tokenResult)}`;

  const result = await sendAndRecordWaitlistEmail({
    tx,
    entryId: entry.id,
    type: 'approval_invite',
    message,
    target,
  });

  await scrubInviteTokenFromJobPayload({
    tx,
    jobId,
    payload,
  });

  return result;
}

async function processWelcomeEmail(params: {
  tx: DbOrTransaction;
  payload: ParsedWaitlistEmailJobPayload;
  entry: LockedWaitlistEmailEntry;
  now: Date;
}): Promise<WaitlistEmailJobResult> {
  const { tx, payload, entry, now } = params;

  if (!shouldSendWaitlistWelcomeForStatus(entry.status)) {
    return skippedWaitlistEmailResult({
      entryId: entry.id,
      type: payload.type,
      detail: `Welcome email skipped for status ${entry.status}`,
    });
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
    return skippedWaitlistEmailResult({
      entryId: entry.id,
      type: payload.type,
      detail: 'Welcome email already sent',
    });
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

export async function processWaitlistEmailJob(
  tx: DbOrTransaction,
  rawPayload: unknown,
  options: { jobId?: string } = {}
): Promise<WaitlistEmailJobResult> {
  const payload = waitlistEmailJobPayloadSchema.parse(rawPayload);
  const now = new Date();
  const entry = await lockAndFetchEntry(tx, payload.entryId);

  if (payload.type === 'waitlist_confirmation') {
    return processWaitlistConfirmationEmail({ tx, payload, entry, now });
  }

  if (payload.type === 'approval_invite') {
    return processApprovalInviteEmail({
      tx,
      payload,
      entry,
      now,
      jobId: options.jobId,
    });
  }

  return processWelcomeEmail({ tx, payload, entry, now });
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
