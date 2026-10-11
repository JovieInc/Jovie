import { NextResponse } from 'next/server';
import { CanonicalUserState } from '@/lib/auth/canonical-user-state';
import { resolveUserState } from '@/lib/auth/gate';
import { getRequestSession } from '@/lib/auth/request-session';
import { captureError } from '@/lib/error-tracking';
import {
  findOnboardingConversation,
  readOnboardingMessages,
  restartOwnedOnboardingConversation,
} from '@/lib/onboarding/conversation.server';
import {
  clearOnboardingSessionCookie,
  getCurrentOnboardingSessionId,
} from '@/lib/onboarding/session';
import {
  checkOnboardingRateLimit,
  createRateLimitHeaders,
  rateLimitDenialStatus,
} from '@/lib/rate-limit';
import { extractClientIPFromRequest } from '@/lib/utils/ip-extraction';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

async function resolvePrincipal() {
  // Prime the maintained per-request cache with a fresh session; auth outages
  // must not silently turn a signed-in read/reset into an anonymous action.
  await getRequestSession('fresh');
  const result = await resolveUserState({ createDbUserIfMissing: false });
  if (
    ![
      CanonicalUserState.UNAUTHENTICATED,
      CanonicalUserState.NEEDS_DB_USER,
      CanonicalUserState.NEEDS_WAITLIST_SUBMISSION,
      CanonicalUserState.WAITLIST_PENDING,
      CanonicalUserState.NEEDS_ONBOARDING,
    ].includes(result.state)
  )
    return null;
  return {
    identityId: result.clerkUserId ?? null,
    userId: result.dbUserId,
    sessionId: await getCurrentOnboardingSessionId(),
  };
}

export async function GET() {
  try {
    const principal = await resolvePrincipal();
    if (!principal)
      return NextResponse.json(
        { error: 'This account cannot continue onboarding.' },
        { status: 403, headers }
      );
    const conversation = await findOnboardingConversation(principal);
    return NextResponse.json(
      {
        identityId: principal.identityId,
        conversationId: conversation?.id ?? null,
        owned: conversation?.owned ?? false,
        messages: conversation
          ? await readOnboardingMessages(conversation.id)
          : [],
      },
      { headers }
    );
  } catch (error) {
    await captureError('Onboarding conversation could not be restored', error, {
      route: '/api/onboarding/conversation',
    });
    return NextResponse.json(
      { error: 'Your conversation could not be restored. Try again.' },
      { status: 503, headers }
    );
  }
}

export async function POST(request: Request) {
  // Reset and logout are explicit same-origin actions, never triggered by a read.
  if (
    request.headers.get('origin') !== new URL(request.url).origin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    return NextResponse.json(
      { error: 'Invalid request origin.' },
      { status: 403, headers }
    );
  }
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid action.' },
        { status: 400, headers }
      );
    }
    const action =
      body && typeof body === 'object' && 'action' in body ? body.action : null;
    if (action !== 'restart' && action !== 'logout')
      return NextResponse.json(
        { error: 'Invalid action.' },
        { status: 400, headers }
      );
    if (action === 'logout') {
      // Logout remains available when transcript/database recovery fails and
      // for blocked accounts; it grants no app access and mutates no history.
      const session = await getRequestSession('fresh');
      if (
        !body ||
        typeof body !== 'object' ||
        !('identityId' in body) ||
        body.identityId !== (session?.user.id ?? null)
      ) {
        return NextResponse.json(
          { error: 'Your account changed. Reload to continue.' },
          { status: 409, headers }
        );
      }
      await clearOnboardingSessionCookie();
      return NextResponse.json({ success: true }, { headers });
    }
    const principal = await resolvePrincipal();
    if (!principal)
      return NextResponse.json(
        { error: 'This account cannot continue onboarding.' },
        { status: 403, headers }
      );
    if (
      !body ||
      typeof body !== 'object' ||
      !('identityId' in body) ||
      body.identityId !== principal.identityId
    ) {
      return NextResponse.json(
        { error: 'Your account changed. Reload to continue.' },
        { status: 409, headers }
      );
    }
    const conversation = await findOnboardingConversation(principal);
    if (
      !('conversationId' in body) ||
      body.conversationId !== (conversation?.id ?? null)
    ) {
      return NextResponse.json(
        { error: 'Your conversation changed. Reload to continue.' },
        { status: 409, headers }
      );
    }
    if (conversation?.owned && principal.userId) {
      const rate = await checkOnboardingRateLimit(
        principal.userId,
        extractClientIPFromRequest(request) || 'unknown'
      );
      if (!rate.success)
        return NextResponse.json(
          { error: rate.reason ?? 'Please try again later.' },
          {
            status: rateLimitDenialStatus(rate),
            headers: { ...headers, ...createRateLimitHeaders(rate) },
          }
        );
      await restartOwnedOnboardingConversation(principal.userId);
    }
    await clearOnboardingSessionCookie();
    return NextResponse.json({ success: true }, { headers });
  } catch (error) {
    await captureError('Onboarding conversation action failed', error, {
      route: '/api/onboarding/conversation',
    });
    return NextResponse.json(
      { error: 'Your conversation could not be updated. Try again.' },
      { status: 503, headers }
    );
  }
}
