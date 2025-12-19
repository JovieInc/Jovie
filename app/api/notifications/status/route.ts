import { NextRequest, NextResponse } from 'next/server';
import {
  buildInvalidRequestResponse,
  getNotificationStatusDomain,
} from '@/lib/notifications/domain';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

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
    const result = await getNotificationStatusDomain(body);
    return NextResponse.json(result.body, {
      status: result.status,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error('[Notifications Status] Error:', error);
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
