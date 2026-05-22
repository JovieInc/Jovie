import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  buildMobileAuthDeepLink,
  sanitizeMobileReturnRoute,
} from '@/lib/mobile/auth-return';
import { createRateLimitHeaders, generalLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const SIGN_IN_TOKEN_TTL_SECONDS = 60;

interface MobileAuthTicketRequest {
  route?: unknown;
}

export async function POST(request: Request) {
  let route = '/app';

  try {
    const payload = (await request
      .json()
      .catch(() => ({}))) as MobileAuthTicketRequest;
    if (typeof payload.route === 'string') {
      route = sanitizeMobileReturnRoute(payload.route) ?? '/app';
    }

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const rateLimit = await generalLimiter.limit(
      `mobile-auth-ticket:${userId}`
    );
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: rateLimit.reason ?? 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            ...createRateLimitHeaders(rateLimit),
          },
        }
      );
    }

    const clerk = await clerkClient();
    const signInToken = await clerk.signInTokens.createSignInToken({
      userId,
      expiresInSeconds: SIGN_IN_TOKEN_TTL_SECONDS,
    });

    return NextResponse.json(
      {
        deepLink: buildMobileAuthDeepLink(signInToken.token, route),
        expiresInSeconds: SIGN_IN_TOKEN_TTL_SECONDS,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Mobile auth ticket route failed', error, {
      route: '/api/mobile/v1/auth/ticket',
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
