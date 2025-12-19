import { NextRequest, NextResponse } from 'next/server';
import {
  buildInvalidRequestResponse,
  unsubscribeFromNotificationsDomain,
} from '@/lib/notifications/domain';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * POST handler for notification unsubscriptions
 * Implements server-side analytics tracking for unsubscription events
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
    const result = await unsubscribeFromNotificationsDomain(body);
    return NextResponse.json(result.body, {
      status: result.status,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error('[Notifications Unsubscribe] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Server error',
        code: 'server_error',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
