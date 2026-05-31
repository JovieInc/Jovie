import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { chatAuditLog, chatConversations } from '@/lib/db/schema/chat';
import { captureError } from '@/lib/error-tracking';
import { materializeClaimedOnboardingProfile } from '@/lib/onboarding/claim-profile';
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
 * Returns: `{ claimed: number, conversationId?: string, profile?: ... }`.
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
      // Compare-and-swap on the primary row FIRST. The WHERE clause only
      // matches a row that is still unclaimed (userId IS NULL) and still has
      // this sessionId. .returning() lets us detect a concurrent claim from
      // another request — if zero rows update, somebody else won the race.
      // We don't use db.transaction() per .claude/rules/db.md, so this CAS
      // is the linearization point that makes the whole sequence safe:
      //   - audit insert is harmless if the CAS later succeeds
      //   - sibling batch is gated on the CAS having claimed primary
      //   - the partial unique index (session_id WHERE user_id IS NOT NULL)
      //     is still the catch-all for the cross-user case
      const claimedPrimary = await db
        .update(chatConversations)
        .set({ userId: userRow.id, updatedAt: new Date() })
        .where(
          and(
            eq(chatConversations.id, primary.id),
            eq(chatConversations.sessionId, sessionId),
            isNull(chatConversations.userId)
          )
        )
        .returning({ id: chatConversations.id });

      if (claimedPrimary.length === 0) {
        const [currentPrimary] = await db
          .select({
            userId: chatConversations.userId,
            creatorProfileId: chatConversations.creatorProfileId,
          })
          .from(chatConversations)
          .where(eq(chatConversations.id, primary.id))
          .limit(1);

        let profile: Awaited<
          ReturnType<typeof materializeClaimedOnboardingProfile>
        > | null = null;
        if (currentPrimary?.userId === userRow.id) {
          profile = currentPrimary.creatorProfileId
            ? {
                profileId: currentPrimary.creatorProfileId,
                handle: null,
                status: 'updated',
              }
            : await materializeClaimedOnboardingProfile({
                userId: userRow.id,
                conversationId: primary.id,
                ipAddress,
                userAgent,
              });
        }

        // Concurrent claim won — primary already has a userId set (likely
        // a duplicate request from the same user retrying after a network
        // blip). Treat as a soft success rather than a 409 because the same
        // user winning twice should not error.
        await clearOnboardingSessionCookie();
        return NextResponse.json({
          claimed: 0,
          conversationId: primary.id,
          alreadyClaimed: true,
          profile,
        });
      }

      const profile = await materializeClaimedOnboardingProfile({
        userId: userRow.id,
        conversationId: primary.id,
        ipAddress,
        userAgent,
      });

      // Audit row records the claim event. Failure here is acceptable —
      // primary is already claimed, audit gap is a forensic loss but not a
      // user-visible failure.
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

      // Detach superseded siblings. Same CAS-style WHERE (still unclaimed
      // with this sessionId) so we never overwrite a row that a concurrent
      // claim already touched.
      if (otherIds.length > 0) {
        await db
          .update(chatConversations)
          .set({
            userId: userRow.id,
            sessionId: null,
            title: '(superseded — claimed alongside another transcript)',
            updatedAt: new Date(),
          })
          .where(
            and(
              inArray(chatConversations.id, otherIds),
              eq(chatConversations.sessionId, sessionId),
              isNull(chatConversations.userId)
            )
          );
      }

      await clearOnboardingSessionCookie();

      return NextResponse.json({
        claimed: candidates.length,
        conversationId: primary.id,
        profile,
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
