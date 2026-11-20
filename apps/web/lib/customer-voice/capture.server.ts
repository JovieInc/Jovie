import 'server-only';

import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { feedbackItems } from '@/lib/db/schema/feedback';
import { captureError } from '@/lib/error-tracking';
import { fetchSummerShadow } from '@/lib/ovie/summer-shadow-client';
import {
  isInternalOrTestAccountEmail,
  normalizeEmail,
} from '@/lib/utils/email';
import { logger } from '@/lib/utils/logger';
import { type UrgentReason, urgentReasons } from './classify';

/**
 * Customer voice to Tim (2026-10-31). Every inbound customer message is stored
 * once in `feedback_items` (the unified feedback store) and handed to Summer,
 * who drafts a reply and texts Tim. Tim approves each draft by iMessage; the
 * approved reply comes back through `/api/internal/ovie/customer-voice/[id]/reply`.
 *
 * Stage timestamps live in `context.customerVoice.stages` so inbound-to-ping
 * and approval-to-send latency are queryable per item.
 */

export const CUSTOMER_VOICE_CHANNELS = [
  'email',
  'chat',
  'feedback',
  'waitlist_reply',
  'review',
  'sms',
] as const;
export type CustomerVoiceChannel = (typeof CUSTOMER_VOICE_CHANNELS)[number];

/** Rows created here; existing feedback rows keep their own source. */
export const CUSTOMER_VOICE_SOURCE_PREFIX = 'customer_voice_';

export type CustomerVoiceStage =
  | 'received'
  | 'captured'
  | 'summer_accepted'
  | 'pinged'
  | 'digested'
  | 'approved'
  | 'sent';

export type CustomerVoiceContext = {
  readonly channel: CustomerVoiceChannel;
  /** Where an approved reply goes. Null when the sender cannot be reached. */
  readonly replyTo: string | null;
  readonly replySubject: string | null;
  readonly inReplyTo: string | null;
  readonly urgent: boolean;
  readonly urgentReasons: readonly UrgentReason[];
  readonly test: boolean;
  readonly code?: string;
  readonly delivery?: string;
  readonly stages: Partial<Record<CustomerVoiceStage, string>>;
};

export type CaptureInput = {
  readonly channel: CustomerVoiceChannel;
  readonly text: string;
  readonly receivedAt: Date;
  readonly userId?: string | null;
  /** Sender address for replies (email from, or the account email). */
  readonly replyTo?: string | null;
  readonly fromName?: string | null;
  readonly subject?: string | null;
  readonly inReplyTo?: string | null;
  /** Where in the product it came from, e.g. "onboarding chat". */
  readonly surface?: string | null;
  /** Reuse an existing feedback row instead of creating one. */
  readonly feedbackItemId?: string;
};

const DAY_MS = 86_400_000;

/** Conventional first name only (never a handle or guessed merge field). */
export function safeFirstName(
  name: string | null | undefined
): string | undefined {
  const parts = (name ?? '').trim().split(/\s+/u);
  const first = parts[0] ?? '';
  if (parts.length < 2 || !/^[A-Z][a-z'-]{1,30}$/u.test(first))
    return undefined;
  return first;
}

type Who = { readonly who: string; readonly name?: string };

async function describeSender(input: CaptureInput): Promise<Who> {
  const where = input.surface ? ` · via ${input.surface}` : '';
  if (!input.userId) {
    return {
      who: `${input.replyTo ? 'Not a Jovie account' : 'Anonymous visitor'}${where}`,
      ...(safeFirstName(input.fromName)
        ? { name: safeFirstName(input.fromName) }
        : {}),
    };
  }
  const [user] = await db
    .select({
      name: users.name,
      createdAt: users.createdAt,
      plan: users.plan,
      userStatus: users.userStatus,
    })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!user) return { who: `Signed-in user${where}` };
  const days = Math.max(
    0,
    Math.floor((input.receivedAt.getTime() - user.createdAt.getTime()) / DAY_MS)
  );
  const status = String(user.userStatus).replaceAll('_', ' ');
  const name = safeFirstName(user.name ?? input.fromName);
  return {
    who: `Signup, ${days === 0 ? 'joined today' : `${days} day${days === 1 ? '' : 's'} in`} · ${status} · ${user.plan ?? 'free'} plan${where}`,
    ...(name ? { name } : {}),
  };
}

async function accountEmail(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: users.email, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row && !row.deletedAt ? row.email : null;
}

async function userIdForEmail(email: string): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return row?.id ?? null;
}

async function writeContext(
  id: string,
  patch: Partial<CustomerVoiceContext>,
  stage?: CustomerVoiceStage,
  at: Date = new Date()
): Promise<void> {
  const { stages: patchStages, ...rest } = patch;
  const stages = {
    ...(patchStages ?? {}),
    ...(stage ? { [stage]: at.toISOString() } : {}),
  };
  // jsonb deep merge on the customerVoice key; first write of a stage wins.
  await db
    .update(feedbackItems)
    .set({
      context: drizzleSql`jsonb_set(
        ${feedbackItems.context},
        '{customerVoice}',
        (coalesce(${feedbackItems.context}->'customerVoice', '{}'::jsonb) || ${JSON.stringify(rest)}::jsonb)
          || jsonb_build_object('stages', ${JSON.stringify(stages)}::jsonb || coalesce(${feedbackItems.context}->'customerVoice'->'stages', '{}'::jsonb)),
        true
      )`,
      updatedAt: at,
    })
    .where(eq(feedbackItems.id, id));
}

export async function recordCustomerVoiceStage(
  id: string,
  stage: CustomerVoiceStage,
  patch: Partial<CustomerVoiceContext> = {},
  at: Date = new Date()
): Promise<void> {
  await writeContext(id, patch, stage, at);
}

/**
 * Capture and hand to Summer. Never throws: capture failures are reported to
 * Sentry so a customer request path is never broken by this loop.
 */
export async function captureCustomerVoice(
  captured: CaptureInput
): Promise<{ id: string } | null> {
  let input = captured;
  const text = input.text.trim().slice(0, 4000);
  if (!text) return null;
  try {
    const reasons = urgentReasons(`${input.subject ?? ''}\n${text}`);
    // In-app messages reply to the account email: a transactional reply to
    // someone who wrote in, never a cold send.
    const replyTo =
      input.replyTo?.trim() ||
      (input.userId ? await accountEmail(input.userId) : null);
    const userId =
      input.userId ?? (replyTo ? await userIdForEmail(replyTo) : null);
    input = { ...input, userId };
    const test = isInternalOrTestAccountEmail(replyTo);
    const context: CustomerVoiceContext = {
      channel: input.channel,
      replyTo: replyTo || null,
      replySubject: input.subject?.trim()?.slice(0, 200) || null,
      inReplyTo: input.inReplyTo ?? null,
      urgent: reasons.length > 0,
      urgentReasons: reasons,
      test,
      stages: {
        received: input.receivedAt.toISOString(),
        captured: new Date().toISOString(),
      },
    };

    let id = input.feedbackItemId;
    if (id) {
      await writeContext(id, context);
    } else {
      // Direct insert (not createFeedbackItem): lib/feedback fans out to this
      // module, so importing it back would be a cycle. These rows are outside
      // the closed-loop classifier by design (source customer_voice_*).
      const [row] = await db
        .insert(feedbackItems)
        .values({
          userId: input.userId ?? null,
          message: text,
          source: `${CUSTOMER_VOICE_SOURCE_PREFIX}${input.channel}`,
          status: 'pending',
          context: {
            pathname: null,
            userAgent: null,
            timestampIso: input.receivedAt.toISOString(),
            customerVoice: context,
          },
        })
        .returning({ id: feedbackItems.id });
      if (!row) throw new Error('customer-voice-persist-failed');
      id = row.id;
    }

    const who = await describeSender(input);
    await notifySummer(id, {
      channel: input.channel,
      receivedAt: input.receivedAt.toISOString(),
      text,
      ...(context.replySubject ? { subject: context.replySubject } : {}),
      ...who,
      replyable: Boolean(context.replyTo),
      urgent: context.urgent,
      urgentReasons: [...reasons],
      test,
    });
    return { id };
  } catch (error) {
    await captureError('Customer voice capture failed', error, {
      channel: input.channel,
    });
    return null;
  }
}

async function notifySummer(
  id: string,
  event: Record<string, unknown>
): Promise<void> {
  if (process.env.VERCEL_ENV !== 'production') {
    logger.info('[customer-voice] Summer handoff skipped outside production', {
      id,
    });
    return;
  }
  const response = await fetchSummerShadow('/ovie/v1/customer-voice/events', {
    method: 'POST',
    body: JSON.stringify({ schema: 'jovie.customer-voice/v1', id, ...event }),
  });
  const body = (await response.json().catch(() => null)) as {
    result?: {
      status?: string;
      code?: string;
      pingedAt?: string;
      delivery?: string;
    };
  } | null;
  const result = body?.result;
  if (!response.ok || !result?.status) {
    throw new Error(`summer-customer-voice-${response.status}`);
  }
  const accepted = new Date();
  const patch: Partial<CustomerVoiceContext> = {
    ...(result.code ? { code: result.code } : {}),
    ...(result.delivery ? { delivery: result.delivery } : {}),
  };
  await writeContext(id, patch, 'summer_accepted', accepted);
  if (result.status === 'pinged' && result.pingedAt) {
    await writeContext(id, {}, 'pinged', new Date(result.pingedAt));
  } else if (result.status === 'digested') {
    await writeContext(id, {}, 'digested', accepted);
  } else if (result.status !== 'replay') {
    throw new Error(`summer-customer-voice-${result.status}`);
  }
}
