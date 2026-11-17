import 'server-only';

/**
 * The `winback_capability_shipped` email job (founder dispatch 2026-11-09):
 * a personal "the capability you wanted just shipped" draft. Lives beside —
 * not inside — `lib/waitlist/email-jobs.ts` because that file sits at its
 * company-guards size baseline and may not grow; this processor rides the
 * same `ingestion_jobs` rail (jobType `send_waitlist_winback_email`) and the
 * same send/record contract, with two extra fail-closed gates that are the
 * founder-locked guarantee nothing sends without Tim's approval:
 *
 * 1. APPROVAL: a valid `jovie.winback-approval/v1` record (approved template
 *    version + admin-approved batch containing the entry) must exist.
 * 2. BUDGET: at most one unanswered win-back per person per 14 days
 *    (JOV-6655).
 *
 * Jobs are created `held_for_approval` (see winback.server.ts) and only an
 * approved-batch promotion moves them to `pending`.
 */

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTransaction } from '@/lib/db';
import { ingestionJobs } from '@/lib/db/schema/ingestion';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { sendNotification } from '@/lib/notifications/service';
import { getEmailSendBlockReason } from '@/lib/utils/email';
import { logger } from '@/lib/utils/logger';
import { decryptPII } from '@/lib/utils/pii-encryption';
import {
  buildWinbackEmail,
  buildWinbackResumeUrl,
  isWithinWinbackOutreachBudget,
  WINBACK_EMAIL_TEMPLATE_VERSION,
  winbackSendApprovalError,
} from '@/lib/waitlist/winback';
import { trackWinbackEvent } from '@/lib/waitlist/winback-analytics';
import {
  getLastUnansweredWinbackSentAt,
  getWinbackApprovalRecord,
} from '@/lib/waitlist/winback-approval.server';
import type { NotificationChannelResult } from '@/types/notifications';

export const winbackCapabilityShippedPayloadSchema = z.object({
  entryId: z.string().uuid(),
  type: z.literal('winback_capability_shipped'),
  capabilityKey: z.string().min(1),
  capabilityLabel: z.string().min(1),
  wants: z.array(z.string().min(1)).min(1),
  handle: z.string().min(1),
  batchId: z.string().min(1),
  cohort: z.string().min(1),
  origin: z.string().url(),
  templateVersion: z.literal(WINBACK_EMAIL_TEMPLATE_VERSION),
  encryptedResumeToken: z.string().min(32),
});

export interface WaitlistWinbackEmailJobResult {
  entryId: string;
  type: 'winback_capability_shipped';
  status: 'sent' | 'skipped' | 'error';
  detail?: string;
}

function skippedResult(
  entryId: string,
  detail: string
): WaitlistWinbackEmailJobResult {
  return {
    entryId,
    type: 'winback_capability_shipped',
    status: 'skipped',
    detail,
  };
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

/**
 * Reserved/canary recipients are refused by the send gateway by design; that
 * refusal is a terminal skip, not a failure (same contract as the waitlist
 * email jobs — no retries, no Sentry paging).
 */
function isReservedRecipientSkip(params: {
  recipientEmail: string;
  result: NotificationChannelResult;
}): boolean {
  return (
    params.result.status === 'skipped' &&
    getEmailSendBlockReason(params.recipientEmail) !== null
  );
}

export async function processWaitlistWinbackEmailJob(
  tx: DbOrTransaction,
  rawPayload: unknown,
  options: { jobId?: string; now?: Date } = {}
): Promise<WaitlistWinbackEmailJobResult> {
  const parsed = winbackCapabilityShippedPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new Error(
      `Invalid winback email job payload: ${
        parsed.error.issues[0]?.message ?? 'unknown'
      }`
    );
  }
  const payload = parsed.data;
  const now = options.now ?? new Date();

  // APPROVAL GATE — fail-closed. Without a valid approval record (approved
  // template version + admin-approved batch containing this entry) the send
  // NEVER happens.
  const approval = await getWinbackApprovalRecord(tx, payload.batchId);
  const approvalError = winbackSendApprovalError(approval, {
    batchId: payload.batchId,
    templateVersion: WINBACK_EMAIL_TEMPLATE_VERSION,
    entryId: payload.entryId,
  });
  if (approvalError) {
    logger.error('[winback] Send refused', {
      detail: approvalError,
      batchId: payload.batchId,
      entryId: payload.entryId,
    });
    return skippedResult(payload.entryId, approvalError);
  }

  // JOV-6655: at most one unanswered win-back per person per 14 days.
  const lastUnanswered = await getLastUnansweredWinbackSentAt(
    tx,
    payload.entryId
  );
  if (
    !isWithinWinbackOutreachBudget({
      lastUnansweredSentAt: lastUnanswered,
      now,
    })
  ) {
    return skippedResult(
      payload.entryId,
      'Winback outreach budget: an unanswered winback was sent within the last 14 days (JOV-6655)'
    );
  }

  const [entry] = await tx
    .select({
      email: waitlistEntries.email,
      fullName: waitlistEntries.fullName,
    })
    .from(waitlistEntries)
    .where(eq(waitlistEntries.id, payload.entryId))
    .limit(1);
  if (!entry) {
    throw new Error(`Waitlist entry not found: ${payload.entryId}`);
  }

  const resumeToken = decryptPII(payload.encryptedResumeToken);
  if (!resumeToken) {
    throw new Error('Failed to decrypt winback resume token');
  }
  const resumeUrl = buildWinbackResumeUrl(payload.origin, resumeToken);
  const { message, target } = buildWinbackEmail({
    email: entry.email,
    fullName: entry.fullName,
    wants: payload.wants,
    capabilityLabel: payload.capabilityLabel,
    handle: payload.handle,
    resumeUrl,
    dedupKey: `winback:${payload.batchId}:${payload.entryId}`,
  });
  message.idempotencyKey = `winback:${payload.batchId}:${payload.entryId}`;

  const dispatch = await sendNotification(message, target);
  const emailResult = getEmailResult(dispatch.results);

  if (emailResult.status !== 'sent') {
    const error = emailResult.error ?? 'Winback email failed';
    if (
      isReservedRecipientSkip({
        recipientEmail: entry.email,
        result: emailResult,
      })
    ) {
      return skippedResult(payload.entryId, error);
    }
    logger.warn('[winback] Email job failed', {
      entryId: payload.entryId,
      batchId: payload.batchId,
      status: emailResult.status,
      detail: emailResult.detail ?? error,
    });
    throw new Error(error);
  }

  await trackWinbackEvent('winback_sent', {
    entry_id: payload.entryId,
    capability_key: payload.capabilityKey,
    batch_id: payload.batchId,
    template_version: WINBACK_EMAIL_TEMPLATE_VERSION,
    winback_cohort: payload.cohort,
  });

  // Scrub the resume token from the job payload after a successful send,
  // mirroring the approval-invite token scrub in email-jobs.ts.
  if (options.jobId) {
    const { encryptedResumeToken: _scrubbed, ...restPayload } = payload;
    await tx
      .update(ingestionJobs)
      .set({ payload: restPayload, updatedAt: now })
      .where(eq(ingestionJobs.id, options.jobId));
  }

  return {
    entryId: payload.entryId,
    type: 'winback_capability_shipped',
    status: 'sent',
    detail: emailResult.detail,
  };
}
