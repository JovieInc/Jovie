import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  completeMobileProfile,
  MobileProfileCompletionError,
} from '@/lib/mobile/complete-profile';
import { getMobileSessionUserId } from '@/lib/mobile/session-auth';

export const runtime = 'nodejs';

interface RequestPayload {
  readonly displayName?: unknown;
  readonly username?: unknown;
}

function statusForError(error: MobileProfileCompletionError): number {
  switch (error.code) {
    case 'forbidden':
      return 403;
    case 'handle_taken':
      return 409;
    case 'invalid_display_name':
    case 'invalid_handle':
      return 400;
    case 'user_not_found':
      return 404;
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getMobileSessionUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const payload = (await request.json().catch(() => ({}))) as RequestPayload;
    if (
      typeof payload.displayName !== 'string' ||
      typeof payload.username !== 'string'
    ) {
      return NextResponse.json(
        {
          error: 'Display name and handle are required.',
          code: 'invalid_request',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await completeMobileProfile({
      userId,
      displayName: payload.displayName,
      username: payload.username,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    if (error instanceof MobileProfileCompletionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: statusForError(error), headers: NO_STORE_HEADERS }
      );
    }

    await captureError('Mobile profile completion failed', error, {
      route: '/api/mobile/v1/profile/complete',
    });
    return NextResponse.json(
      {
        error: 'Profile setup is temporarily unavailable.',
        code: 'internal_error',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
