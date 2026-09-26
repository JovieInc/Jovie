import { NextResponse } from 'next/server';
import { isUnauthorizedSessionError } from '@/lib/auth/session';
import { revokeOtherAccountSessions } from '@/lib/auth/sessions';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

export async function POST() {
  try {
    await revokeOtherAccountSessions();
    return NextResponse.json(
      { success: true },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (isUnauthorizedSessionError(error)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    logger.error(
      '[api/account/sessions/revoke-others] Failed to revoke other sessions:',
      error
    );
    await captureError('Failed to revoke other account sessions', error, {
      route: '/api/account/sessions/revoke-others',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Unable to sign out other sessions right now.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
