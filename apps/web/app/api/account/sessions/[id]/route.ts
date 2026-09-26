import { NextResponse } from 'next/server';
import { isUnauthorizedSessionError } from '@/lib/auth/session';
import {
  CannotRevokeCurrentSessionError,
  revokeAccountSession,
  SessionNotFoundError,
} from '@/lib/auth/sessions';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await revokeAccountSession(id);
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
    if (error instanceof SessionNotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    if (error instanceof CannotRevokeCurrentSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    logger.error('[api/account/sessions/:id] Failed to revoke session:', error);
    await captureError('Failed to revoke account session', error, {
      route: '/api/account/sessions/[id]',
      method: 'DELETE',
    });
    return NextResponse.json(
      { error: 'Unable to end that session right now.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
