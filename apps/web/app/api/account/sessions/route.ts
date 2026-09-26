import { NextResponse } from 'next/server';
import { isUnauthorizedSessionError } from '@/lib/auth/session';
import { listAccountSessions } from '@/lib/auth/sessions';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const sessions = await listAccountSessions();
    return NextResponse.json(
      { sessions },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (isUnauthorizedSessionError(error)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    logger.error('[api/account/sessions] Failed to list sessions:', error);
    await captureError('Failed to list account sessions', error, {
      route: '/api/account/sessions',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Unable to load sessions right now.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
