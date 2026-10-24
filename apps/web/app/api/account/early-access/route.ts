import { NextResponse } from 'next/server';
import { getAppUserById } from '@/lib/auth/app-user';
import { getFreshAuth } from '@/lib/auth/cached';
import {
  earlyAccessToggleLimiter,
  isEarlyAccess,
  setEarlyAccess,
} from '@/lib/early-access/server';
import { NO_STORE_HEADERS, RETRY_AFTER_SERVICE } from '@/lib/http/headers';

export const runtime = 'nodejs';

function errorResponse(error: string, status: number, retryAfter?: string) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        ...NO_STORE_HEADERS,
        ...(retryAfter ? { 'Retry-After': retryAfter } : {}),
      },
    }
  );
}

async function authenticatedUser() {
  const auth = await getFreshAuth();
  if (!auth.userId) return null;
  return auth.userId;
}

export async function GET() {
  const userId = await authenticatedUser();
  if (!userId) return errorResponse('Authentication required.', 401);
  return NextResponse.json(
    { enabled: await isEarlyAccess({ id: userId }) },
    { headers: NO_STORE_HEADERS }
  );
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin !== new URL(request.url).origin) {
    return errorResponse('Invalid request origin.', 403);
  }

  const userId = await authenticatedUser();
  if (!userId) return errorResponse('Authentication required.', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Expected a JSON enabled value.', 400);
  }
  if (
    !body ||
    typeof body !== 'object' ||
    !('enabled' in body) ||
    typeof body.enabled !== 'boolean'
  ) {
    return errorResponse('Expected a JSON enabled value.', 400);
  }

  const limit = await earlyAccessToggleLimiter.limit(userId);
  if (limit.unavailable) {
    return errorResponse(
      'Early-access settings are temporarily unavailable.',
      503,
      RETRY_AFTER_SERVICE
    );
  }
  if (!limit.success)
    return errorResponse('Daily early-access toggle limit reached.', 429);

  const user = await getAppUserById(userId);
  const enabled = await setEarlyAccess(
    userId,
    body.enabled,
    user?.name ?? user?.email ?? 'Jovie user'
  );
  return NextResponse.json({ enabled }, { headers: NO_STORE_HEADERS });
}
