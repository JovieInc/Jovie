import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCachedAuth, getCachedCurrentUser } from '@/lib/auth/cached';
import { decodeToolEvents } from '@/lib/chat/tool-events';
import { db } from '@/lib/db';
import {
  chatAuditLog,
  chatConversations,
  chatMessages,
} from '@/lib/db/schema/chat';
import { captureError } from '@/lib/error-tracking';
import { materializeClaimedOnboardingProfile } from '@/lib/onboarding/claim-profile';
import { deriveClaimedOnboardingStateFromMessageRows } from '@/lib/onboarding/claimed-state';
import { isOnboardingOwnershipError } from '@/lib/onboarding/ownership-gate';
import {
  clearOnboardingSessionCookie,
  getCurrentOnboardingSessionId,
} from '@/lib/onboarding/session';
import { normalizeEmail } from '@/lib/utils/email';
import { extractClientIPFromRequest } from '@/lib/utils/ip-extraction';
import { logger } from '@/lib/utils/logger';
import { waitlistRequestSchema } from '@/lib/validation/schemas';
import {
  submitWaitlistAccessRequest,
  type WaitlistAccessRequestResult,
} from '@/lib/waitlist/access-request';
import { isWaitlistGateEnabled } from '@/lib/waitlist/settings';
import {
  isWaitlistApprovedStatus,
  isWaitlistPendingStatus,
} from '@/lib/waitlist/state-machine';

export const runtime = 'nodejs';

type ClaimedProfilePayload = Awaited<
  ReturnType<typeof materializeClaimedOnboardingProfile>
>;

class WaitlistPersistenceError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super('Waitlist request could not be saved');
    this.name = 'WaitlistPersistenceError';
    this.cause = cause;
  }
}

class WaitlistIntakeRequiredError extends Error {
  constructor() {
    super('A confirmed artist or social profile is required for waitlist');
    this.name = 'WaitlistIntakeRequiredError';
  }
}

function profilePayload(
  profile: ClaimedProfilePayload | null
): { profile: ClaimedProfilePayload } | Record<string, never> {
  return profile?.profileId ? { profile } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deriveFullName(params: {
  readonly userFullName: string | null | undefined;
  readonly userUsername: string | null | undefined;
  readonly email: string;
}): string {
  const fromUser = (params.userFullName ?? '').trim();
  if (fromUser) return fromUser;

  const fromUsername = (params.userUsername ?? '').trim();
  if (fromUsername) return fromUsername;

  return params.email.split('@')[0]?.trim() || 'Jovie user';
}

function hasDurablePublicArtistIdentity(
  rows: readonly { toolCalls: unknown }[]
): boolean {
  const state = deriveClaimedOnboardingStateFromMessageRows(rows);
  return Boolean(state.socialLinks[0] ?? state.artist?.url);
}

function hasWaitlistDecision(rows: readonly { toolCalls: unknown }[]): boolean {
  const events = rows.flatMap(row => decodeToolEvents(row.toolCalls).events);
  for (const event of events.toReversed()) {
    if (event.toolName !== 'proposeNextStep' || event.state !== 'succeeded') {
      continue;
    }
    const output = isRecord(event.output) ? event.output : null;
    const decision = isRecord(output?.decision) ? output.decision : null;
    return (
      output?.action === 'propose_next_step' && decision?.kind === 'waitlist'
    );
  }
  return false;
}

async function createWaitlistReceipt(params: {
  readonly appUserId: string;
  readonly messageRows: readonly { toolCalls: unknown }[];
}): Promise<WaitlistAccessRequestResult> {
  const currentUser = await getCachedCurrentUser();
  const emailRaw = currentUser?.primaryEmailAddress?.emailAddress;
  if (!emailRaw) throw new Error('Verified email is required for waitlist');

  const state = deriveClaimedOnboardingStateFromMessageRows(params.messageRows);
  // The scripted flow explicitly permits skipping social attachment after a
  // Spotify artist is confirmed. Spotify is still a validated public artist
  // profile, so it is the truthful durable fallback for that supported path.
  const primarySocialUrl = state.socialLinks[0] ?? state.artist?.url;
  if (!primarySocialUrl) {
    throw new WaitlistIntakeRequiredError();
  }

  const email = normalizeEmail(emailRaw);
  const waitlistData = waitlistRequestSchema.parse({
    primaryGoal: null,
    primarySocialUrl,
    spotifyUrl: state.artist?.url ?? null,
    spotifyArtistName: state.artist?.name ?? null,
    heardAbout: 'onboarding_chat',
    selectedPlan: null,
  });

  return submitWaitlistAccessRequest({
    appUserId: params.appUserId,
    email,
    emailRaw,
    fullName: deriveFullName({
      userFullName: currentUser.fullName,
      userUsername: currentUser.username,
      email,
    }),
    data: waitlistData,
    source: 'onboarding_chat_claim',
  });
}

async function loadConversationMessageRows(conversationId: string) {
  return db
    .select({ toolCalls: chatMessages.toolCalls })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(chatMessages.createdAt);
}

async function createWaitlistReceiptOrThrow(params: {
  readonly appUserId: string;
  readonly messageRows: readonly { toolCalls: unknown }[];
}) {
  try {
    return await createWaitlistReceipt(params);
  } catch (error) {
    if (error instanceof WaitlistIntakeRequiredError) throw error;
    throw new WaitlistPersistenceError(error);
  }
}

interface ClaimHandoff {
  readonly profile: ClaimedProfilePayload | null;
  readonly waitlist: WaitlistAccessRequestResult | null;
  readonly waitlistIntakeRequired: boolean;
}

async function resolveClaimHandoff(params: {
  readonly appUserId: string;
  readonly conversationId: string;
  readonly messageRows: readonly { toolCalls: unknown }[];
  readonly mustWaitlist: boolean;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}): Promise<ClaimHandoff> {
  if (!params.mustWaitlist) {
    return {
      profile: await materializeClaimedOnboardingProfile({
        userId: params.appUserId,
        conversationId: params.conversationId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      }),
      waitlist: null,
      waitlistIntakeRequired: false,
    };
  }

  let waitlist: WaitlistAccessRequestResult;
  try {
    waitlist = await createWaitlistReceiptOrThrow({
      appUserId: params.appUserId,
      messageRows: params.messageRows,
    });
  } catch (error) {
    if (error instanceof WaitlistIntakeRequiredError) {
      return {
        profile: null,
        waitlist: null,
        waitlistIntakeRequired: true,
      };
    }
    throw error;
  }

  if (isWaitlistPendingStatus(waitlist.status)) {
    return { profile: null, waitlist, waitlistIntakeRequired: false };
  }
  if (!isWaitlistApprovedStatus(waitlist.status)) {
    throw new WaitlistPersistenceError(
      new Error(`Unsupported waitlist status: ${waitlist.status}`)
    );
  }

  return {
    profile: await materializeClaimedOnboardingProfile({
      userId: params.appUserId,
      conversationId: params.conversationId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    }),
    waitlist: null,
    waitlistIntakeRequired: false,
  };
}

function claimHandoffPayload(handoff: ClaimHandoff) {
  return {
    ...(handoff.waitlist ? { waitlist: handoff.waitlist } : {}),
    ...(handoff.waitlistIntakeRequired ? { waitlistIntakeRequired: true } : {}),
    ...profilePayload(handoff.profile),
  };
}

/**
 * POST /api/onboarding/claim (JOV-2132).
 *
 * Called by the inline signup completion handler to associate any anonymous
 * onboarding chat transcript(s) with the freshly created app user.
 *
 * Flow:
 *  1. Require auth (must be called from an authenticated context — the user
 *     just signed up and Better Auth has provisioned the app user).
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
    // getCachedAuth().userId is the app `users.id` UUID. A valid Better Auth
    // session without a linked app user intentionally resolves to null.
    const { userId } = await getCachedAuth();
    if (!userId) {
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

    const accessControlled = await isWaitlistGateEnabled().catch(
      async error => {
        await captureError('Onboarding claim gate lookup failed', error, {
          route: '/api/onboarding/claim',
          method: 'POST',
        });
        return true;
      }
    );
    const ipAddress = extractClientIPFromRequest(req);
    const userAgent = req.headers.get('user-agent') ?? null;

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
      // A committed first request can lose its response before the browser
      // receives the cookie clear. Recover the same user's claimed transcript
      // and rebuild the idempotent waitlist receipt instead of stalling.
      const [alreadyClaimed] = await db
        .select({ id: chatConversations.id })
        .from(chatConversations)
        .where(
          and(
            eq(chatConversations.sessionId, sessionId),
            eq(chatConversations.userId, userId)
          )
        )
        .orderBy(desc(chatConversations.createdAt))
        .limit(1);

      if (alreadyClaimed) {
        const messageRows = await loadConversationMessageRows(
          alreadyClaimed.id
        );
        const mustWaitlist =
          accessControlled || hasWaitlistDecision(messageRows);
        if (mustWaitlist && !hasDurablePublicArtistIdentity(messageRows)) {
          return NextResponse.json({
            claimed: 0,
            conversationId: alreadyClaimed.id,
            alreadyClaimed: true,
            waitlistIntakeRequired: true,
          });
        }
        const handoff = await resolveClaimHandoff({
          appUserId: userId,
          conversationId: alreadyClaimed.id,
          messageRows,
          mustWaitlist,
          ipAddress,
          userAgent,
        });
        await clearOnboardingSessionCookie();
        return NextResponse.json({
          claimed: 0,
          conversationId: alreadyClaimed.id,
          alreadyClaimed: true,
          ...claimHandoffPayload(handoff),
        });
      }

      // Nothing to claim — clear the cookie so future visits start fresh.
      await clearOnboardingSessionCookie();
      return NextResponse.json({ claimed: 0 });
    }

    const [primary, ...others] = candidates;
    const otherIds = others.map(o => o.id);

    try {
      const messageRows = await loadConversationMessageRows(primary.id);
      const mustWaitlist = accessControlled || hasWaitlistDecision(messageRows);

      // Do not consume the anonymous transcript until a public artist
      // identity exists. The same /start conversation retries after the next
      // natural-language turn (JOV-5001).
      if (mustWaitlist && !hasDurablePublicArtistIdentity(messageRows)) {
        return NextResponse.json({
          claimed: 0,
          waitlistIntakeRequired: true,
        });
      }

      // Compare-and-swap ownership before writing user-scoped waitlist data.
      // The WHERE clause only
      // matches a row that is still unclaimed (userId IS NULL) and still has
      // this sessionId. .returning() lets us detect a concurrent claim from
      // another request — if zero rows update, somebody else won the race.
      // We don't use db.transaction() per .claude/rules/db.md, so this CAS is
      // the ownership linearization point. A failed downstream waitlist write
      // remains retryable through the same-user recovery branch above.
      const claimedPrimary = await db
        .update(chatConversations)
        .set({ userId, updatedAt: new Date() })
        .where(
          and(
            eq(chatConversations.id, primary.id),
            eq(chatConversations.sessionId, sessionId),
            isNull(chatConversations.userId)
          )
        )
        .returning({ id: chatConversations.id });

      if (claimedPrimary.length === 0) {
        const [ownedByCurrentUser] = await db
          .select({ id: chatConversations.id })
          .from(chatConversations)
          .where(
            and(
              eq(chatConversations.id, primary.id),
              eq(chatConversations.userId, userId)
            )
          )
          .limit(1);
        if (!ownedByCurrentUser) {
          return NextResponse.json(
            {
              error: 'Session already claimed',
              errorCode: 'SESSION_ALREADY_CLAIMED',
            },
            { status: 409 }
          );
        }

        if (mustWaitlist && !hasDurablePublicArtistIdentity(messageRows)) {
          return NextResponse.json({
            claimed: 0,
            conversationId: primary.id,
            alreadyClaimed: true,
            waitlistIntakeRequired: true,
          });
        }

        const handoff = await resolveClaimHandoff({
          appUserId: userId,
          conversationId: primary.id,
          messageRows,
          mustWaitlist,
          ipAddress,
          userAgent,
        });
        await clearOnboardingSessionCookie();
        return NextResponse.json({
          claimed: 0,
          conversationId: primary.id,
          alreadyClaimed: true,
          ...claimHandoffPayload(handoff),
        });
      }

      const handoff = await resolveClaimHandoff({
        appUserId: userId,
        conversationId: primary.id,
        messageRows,
        mustWaitlist,
        ipAddress,
        userAgent,
      });

      // Controlled-access visitors stop at the durable waitlist receipt. Only
      // instant-access decisions may materialize a claimed/public profile and
      // proceed to checkout.

      // Audit row records the claim event. Failure here is acceptable —
      // primary is already claimed, audit gap is a forensic loss but not a
      // user-visible failure.
      await db.insert(chatAuditLog).values({
        userId,
        creatorProfileId: null,
        conversationId: primary.id,
        action: 'claim_anonymous_conversation',
        field: 'user_id',
        previousValue: null,
        newValue: userId,
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
            userId,
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
        ...claimHandoffPayload(handoff),
      });
    } catch (error) {
      // Ownership gate: unauthenticated / non-owner / missing conversation.
      // Fail closed — never surface reserved / locked-in success without verify.
      if (isOnboardingOwnershipError(error)) {
        logger.warn('[onboarding/claim] ownership gate rejected claim', {
          errorCode: error.errorCode,
          sessionId: `${sessionId.slice(0, 8)}…`,
        });
        return NextResponse.json(
          { error: error.message, errorCode: error.errorCode },
          { status: error.status }
        );
      }

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
    if (error instanceof WaitlistPersistenceError) {
      logger.error(
        '[onboarding/claim] waitlist persistence failed',
        error.cause
      );
      await captureError(
        'Onboarding waitlist persistence failed',
        error.cause,
        {
          route: '/api/onboarding/claim',
          method: 'POST',
        }
      );
      return NextResponse.json(
        {
          error: 'Waitlist request could not be saved',
          errorCode: 'WAITLIST_SAVE_FAILED',
        },
        { status: 500 }
      );
    }
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
