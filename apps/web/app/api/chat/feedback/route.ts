/**
 * In-chat 👍/👎 feedback capture (JOV #11460).
 *
 * POST /api/chat/feedback — records, updates, or removes a vote on an
 * assistant message or tool/skill result. Rows land in the unified
 * `feedback_items` store (see `lib/db/schema/feedback.ts`) so Eve can query
 * them via SQL for the model A/B bake-off loop.
 *
 * Attribution: when the client supplies a `turnId`, the producing model is
 * resolved server-side from `chat_turns.model` (server truth — survives
 * reloads and cannot be spoofed). The client-provided `modelUsed` is only a
 * fallback for turns persisted before the model column existed.
 *
 * Idempotency: one row per (user, message, tool call). Re-voting updates the
 * row in place; `vote: null` removes it.
 */
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { chatToolSchema } from '@/lib/chat/strict-schema';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { chatTurns } from '@/lib/db/schema/chat';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { deleteChatMessageVote, upsertChatMessageVote } from '@/lib/feedback';
import { parseJsonBody } from '@/lib/http/parse-json';
import { createRateLimitHeaders, generalLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';

const payloadSchema = chatToolSchema({
  messageId: z.string().trim().min(1).max(128),
  /** 'up' | 'down' to vote, null to undo the current vote. */
  vote: z.enum(['up', 'down']).nullable(),
  conversationId: z.string().uuid().optional(),
  turnId: z.string().uuid().optional(),
  toolCallId: z.string().trim().max(128).optional(),
  toolName: z.string().trim().max(120).optional(),
  /** Client-side fallback only — server resolves from chat_turns when possible. */
  modelUsed: z.string().trim().max(120).optional(),
  messageExcerpt: z.string().trim().max(1000).optional(),
});

export const runtime = 'nodejs';

/** Votes are tiny; excerpt alone capped at 1000 chars. */
const MAX_BODY_SIZE = 8 * 1024;

export async function POST(request: Request) {
  try {
    const { userId: clerkId } = await getCachedAuth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimit = await generalLimiter.limit(clerkId);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many feedback submissions' },
        { status: 429, headers: createRateLimitHeaders(rateLimit) }
      );
    }

    const parsedBody = await parseJsonBody<unknown>(request, {
      route: '/api/chat/feedback',
      maxBodySize: MAX_BODY_SIZE,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const parsed = payloadSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const userRecord = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
      columns: { id: true },
    });
    if (!userRecord) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { messageId, vote, toolCallId, toolName, messageExcerpt } =
      parsed.data;

    if (vote === null) {
      await deleteChatMessageVote({
        userId: userRecord.id,
        messageId,
        toolCallId,
      });
      return NextResponse.json({ ok: true, vote: null });
    }

    // Server-truth model + conversation attribution via the persisted turn.
    // Ownership is asserted — a turn belonging to another user is ignored
    // rather than leaking its metadata.
    let resolvedModel: string | null = null;
    let resolvedConversationId: string | null = null;
    let resolvedTurnId: string | null = null;
    if (parsed.data.turnId) {
      const turn = await db.query.chatTurns.findFirst({
        where: eq(chatTurns.id, parsed.data.turnId),
        columns: { id: true, userId: true, conversationId: true, model: true },
      });
      if (turn && turn.userId === userRecord.id) {
        resolvedTurnId = turn.id;
        resolvedConversationId = turn.conversationId;
        resolvedModel = turn.model;
      }
    }

    const entitlements = await getCurrentUserEntitlements();

    const item = await upsertChatMessageVote({
      userId: userRecord.id,
      messageId,
      vote,
      conversationId: resolvedConversationId ?? parsed.data.conversationId,
      turnId: resolvedTurnId,
      toolCallId,
      toolName,
      modelUsed: resolvedModel ?? parsed.data.modelUsed ?? null,
      plan: entitlements.plan,
      messageExcerpt,
      context: {
        userAgent: request.headers.get('user-agent'),
        timestampIso: new Date().toISOString(),
        modelSource: resolvedModel ? 'turn' : 'client',
      },
    });

    return NextResponse.json({ ok: true, id: item.id, vote });
  } catch (error) {
    logger.error('[api/chat/feedback] Failed to record vote:', error);
    await captureError('Chat feedback vote failed', error, {
      route: '/api/chat/feedback',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Unable to record feedback' },
      { status: 500 }
    );
  }
}
