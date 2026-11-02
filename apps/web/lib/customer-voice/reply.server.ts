import 'server-only';

import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { feedbackItems } from '@/lib/db/schema/feedback';
import { sendStreamEmail } from '@/lib/email/gateway';
import {
  type CustomerVoiceContext,
  recordCustomerVoiceStage,
} from './capture.server';

export const customerReplySchema = z
  .object({
    text: z.string().trim().min(2).max(4000),
    draftSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    approvedAt: z.string().datetime(),
    /** Summer's Photon admission key for Tim's approving message. */
    approvalKey: z.string().min(8).max(128),
  })
  .strict();
export type CustomerReplyInput = z.infer<typeof customerReplySchema>;

export type CustomerReplyResult =
  | { status: 'sent'; sentAt: string }
  | {
      status: 'refused';
      code:
        | 'not_found'
        | 'not_customer_voice'
        | 'no_reply_address'
        | 'already_sent'
        | 'draft_mismatch'
        | 'send_failed';
      httpStatus: number;
    };

function readContext(raw: unknown): CustomerVoiceContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = (raw as { customerVoice?: unknown }).customerVoice;
  if (!value || typeof value !== 'object') return null;
  return value as CustomerVoiceContext;
}

function replySubject(subject: string | null): string {
  if (!subject) return 'Re: your note to Jovie';
  return /^re:/iu.test(subject) ? subject : `Re: ${subject}`;
}

/**
 * Send one founder-approved reply. Only to the item's original sender, only
 * once, and only when the text is byte-identical to what Tim approved.
 * Summer cannot choose the recipient.
 */
export async function sendApprovedCustomerReply(
  id: string,
  input: CustomerReplyInput
): Promise<CustomerReplyResult> {
  const [item] = await db
    .select({ id: feedbackItems.id, context: feedbackItems.context })
    .from(feedbackItems)
    .where(eq(feedbackItems.id, id))
    .limit(1);
  if (!item) return { status: 'refused', code: 'not_found', httpStatus: 404 };
  const context = readContext(item.context);
  if (!context) {
    return { status: 'refused', code: 'not_customer_voice', httpStatus: 422 };
  }
  if (!context.replyTo) {
    return { status: 'refused', code: 'no_reply_address', httpStatus: 422 };
  }
  if (context.stages?.sent) {
    return { status: 'refused', code: 'already_sent', httpStatus: 409 };
  }
  const sha = createHash('sha256').update(input.text).digest('hex');
  if (sha !== input.draftSha256) {
    return { status: 'refused', code: 'draft_mismatch', httpStatus: 422 };
  }

  await recordCustomerVoiceStage(
    id,
    'approved',
    {},
    new Date(input.approvedAt)
  );
  const result = await sendStreamEmail({
    stream: 'founder',
    purpose: 'customer-voice-reply',
    to: context.replyTo,
    subject: replySubject(context.replySubject),
    text: input.text,
    consent: {
      basis: 'existing-relationship',
      evidence: `feedback_item:${id}`,
    },
    idempotencyKey: `customer-voice-reply:${id}`,
    ...(context.inReplyTo
      ? {
          headers: {
            'In-Reply-To': context.inReplyTo,
            References: context.inReplyTo,
          },
        }
      : {}),
  });
  if (result.status !== 'sent') {
    return { status: 'refused', code: 'send_failed', httpStatus: 502 };
  }
  const sentAt = new Date();
  await recordCustomerVoiceStage(id, 'sent', {}, sentAt);
  return { status: 'sent', sentAt: sentAt.toISOString() };
}
