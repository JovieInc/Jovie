import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { chatAuditLog, chatConversations } from '@/lib/db/schema/chat';
import { captureError } from '@/lib/error-tracking';
import {
  clearOnboardingSessionCookie,
  getCurrentOnboardingSessionId,
} from '@/lib/onboarding/session';
import { extractClientIPFromRequest } from '@/lib/utils/ip-extraction';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

/**
 * POST /api/onboarding/claim (JOV-2132).
 *
 * Called by the inline Clerk SignUp completion handler to associate any
 * anonymous onboarding chat transcript(s) with the freshly created Clerk user.
 *
 * Flow:
 *  1. Require Clerk auth (must be called from an authenticated context — the
 *     user just signed up; Clerk middleware has populated request auth).
 *  2. Resolve the signed sessionId from the onboarding cookie.
 *  3. SELECT all chat_conversations rows where sessionId = ? AND userId IS NULL.
 *  4. If 1 row → UPDATE userId, record consent audit log entry.
 *  5. If 2+ rows → claim the most recent, mark others as discarded in audit log.
 *  6. If 0 rows → no-op success (idempotent).
 *
 * The chat_conversations.session_id partial unique index prevents the same
 * sessionId from being claimed twice onto different users (constraint
 * violation surfaces as a friendly 409).
 *
 * Returns: `{ claimed: number, conversationId?: string }`.
 */
export async function POST(req: Request) {
  try {
    const { userId: clerkUserId } = await getCachedAuth();
    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'Unauthorized', errorCode: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const sessionId = await getCurrentOnboardingSessionId();
    if (!sessionId) {
      // No anonymous session to claim — successful no-op so the client can
      // call this endpoint unconditionally after sign-up.
      return NextResponse.json({ claimed: 0 });
    }

    // Resolve the internal DB users.id from the Clerk user id.
    const [userRow] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!userRow) {
      // The Clerk user has authenticated but hasn't been mirrored into our
      // users table yet (Clerk webhook race). Treat as a soft success — the
      // client can retry once the webhook fires.
      return NextResponse.json({ claimed: 0, retryAfterWebhook: true });
    }

    // Look up all unclaimed conversations tied to this sessionId.
    const candidates = await db
      .select({
        id: chatConversations.id,
        createdAt: chatConversations.createdAt,
      })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.sessionId, sessionId),
          isNull(chatConversations.userId)
        )
      )
      .orderBy(desc(chatConversations.createdAt));

    if (candidates.length === 0) {
      // Nothing to claim — clear the cookie so future visits start fresh.
      await clearOnboardingSessionCookie();
      return NextResponse.json({ claimed: 0 });
    }

    const [primary, ...others] = candidates;
    const ipAddress = extractClientIPFromRequest(req);
    const userAgent = req.headers.get('user-agent') ?? null;
    const otherIds = others.map(o => o.id);

    try {
      // Ordering matters here. The partial unique index on (session_id) WHERE
      // user_id IS NOT NULL means we cannot have multiple rows with the same
      // sessionId AND user_id set. We satisfy the constraint by clearing the
      // sessionId on superseded rows BEFORE we set user_id on the primary.
      //
      // Sequence (no db.transaction per .claude/rules/db.md):
      //  1. Audit-log first — if this fails, no state mutation has happened.
      //  2. Detach superseded rows from the session + mark superseded title
      //     + assign them to the user. Once session_id is null, the partial
      //     unique index no longer applies to these rows.
      //  3. Claim the primary row last — by this point only one row with
      //     this sessionId remains, so the unique index won't fire.

      // 1. Audit row first (safe to write; no FK from other tables depends on it).
      await db.insert(chatAuditLog).values({
        userId: userRow.id,
        creatorProfileId: null,
        conversationId: primary.id,
        action: 'claim_anonymous_conversation',
        field: 'user_id',
        previousValue: null,
        newValue: userRow.id,
        metadata: {
          sessionId,
          claimedConversationCount: candidates.length,
          discardedConversationIds: otherIds,
        },
        ipAddress,
        userAgent,
      });

      // 2. Detach superseded siblings (clear sessionId so the partial unique
      //    index releases them) in a single batch update via inArray. We still
      //    set userId so the user can browse the discarded transcripts in
      //    their dashboard, and we suffix the title to mark them as superseded.
      if (otherIds.length > 0) {
        await db
          .update(chatConversations)
          .set({
            userId: userRow.id,
            sessionId: null,
            title: '(superseded — claimed alongside another transcript)',
            updatedAt: new Date(),
          })
          .where(inArray(chatConversations.id, otherIds));
      }

      // 3. Claim the primary row last.
      await db
        .update(chatConversations)
        .set({ userId: userRow.id, updatedAt: new Date() })
        .where(eq(chatConversations.id, primary.id));

      await clearOnboardingSessionCookie();

      return NextResponse.json({
        claimed: candidates.length,
        conversationId: primary.id,
      });
    } catch (error) {
      // Unique-constraint violation on the partial index = this sessionId was
      // already claimed onto a different user. Surface a friendly 409.
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (
        message.includes('idx_chat_conversations_session_id_claimed_unique') ||
        message.includes('unique')
      ) {
        logger.warn(
          '[onboarding/claim] session already claimed onto a different user',
          { sessionId: `${sessionId.slice(0, 8)}…` }
        );
        return NextResponse.json(
          {
            error: 'Session already claimed',
            errorCode: 'SESSION_ALREADY_CLAIMED',
          },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error) {
    logger.error('[onboarding/claim] failed', error);
    await captureError('Onboarding claim endpoint failed', error, {
      route: '/api/onboarding/claim',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Internal error', errorCode: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
