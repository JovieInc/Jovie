import { NextRequest, NextResponse } from 'next/server';
import {
  AUDIENCE_COOKIE_NAME,
  buildInvalidRequestResponse,
  subscribeToNotificationsDomain,
} from '@/lib/notifications/domain';

// Resend + DB access requires Node runtime
export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * POST handler for notification subscriptions
 * Implements server-side analytics tracking for subscription events
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const invalidResponse = buildInvalidRequestResponse();
    return NextResponse.json(invalidResponse.body, {
      status: invalidResponse.status,
      headers: NO_STORE_HEADERS,
    });
  }

  try {
    const result = await subscribeToNotificationsDomain(body, {
      headers: request.headers,
    });

    const response = NextResponse.json(result.body, {
      status: result.status,
      headers: NO_STORE_HEADERS,
    });

    if (result.audienceIdentified) {
      response.cookies.set(AUDIENCE_COOKIE_NAME, '1', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      });
    }

    return response;
  } catch (error) {
    console.error('[Notifications Subscribe] Error:', error);
    const response = NextResponse.json(
      {
        success: false,
        error: 'Server error',
        code: 'server_error',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
    return response;
  }
}
