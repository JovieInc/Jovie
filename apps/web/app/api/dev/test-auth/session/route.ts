import { NextRequest, NextResponse } from 'next/server';
import {
  buildDevTestAuthCookieDescriptors,
  DEV_TEST_AUTH_COOKIE_NAMES,
  ensureDevTestAuthActor,
  getCachedDevTestAuthSession,
  getDevTestAuthAvailability,
  parseDevTestAuthPersona,
} from '@/lib/auth/dev-test-auth.server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

function applyNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', NO_STORE_HEADERS['Cache-Control']);
  return response;
}

function clearDevTestAuthCookies(response: NextResponse) {
  for (const cookieName of DEV_TEST_AUTH_COOKIE_NAMES) {
    response.cookies.set(cookieName, '', {
      expires: new Date(0),
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
    });
  }
}

function applyDevTestAuthCookies(
  response: NextResponse,
  request: NextRequest,
  clerkUserIdActor: Awaited<ReturnType<typeof ensureDevTestAuthActor>>
) {
  for (const cookie of buildDevTestAuthCookieDescriptors(
    clerkUserIdActor,
    request.nextUrl.protocol === 'https:'
  )) {
    response.cookies.set(cookie);
  }
}

export async function GET(request: NextRequest) {
  const availability = getDevTestAuthAvailability(request.nextUrl.hostname);

  if (!availability.enabled || !availability.trustedHost) {
    return NextResponse.json(
      {
        enabled: availability.enabled,
        trustedHost: availability.trustedHost,
        active: false,
        persona: null,
        userId: null,
        email: null,
        profilePath: null,
        reason: availability.reason,
      },
      { headers: NO_STORE_HEADERS }
    );
  }

  const session = await getCachedDevTestAuthSession();

  return NextResponse.json(
    {
      enabled: true,
      trustedHost: true,
      active: Boolean(session),
      persona: session?.persona ?? null,
      userId: session?.clerkUserId ?? null,
      email: session?.email ?? null,
      profilePath: session?.profilePath ?? null,
      reason: null,
    },
    { headers: NO_STORE_HEADERS }
  );
}

export async function POST(request: NextRequest) {
  const availability = getDevTestAuthAvailability(request.nextUrl.hostname);

  if (!availability.enabled || !availability.trustedHost) {
    return NextResponse.json(
      {
        success: false,
        error: availability.reason,
      },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    persona?: string;
  };
  const persona = parseDevTestAuthPersona(body.persona ?? null) ?? 'creator';

  if (body.persona && !parseDevTestAuthPersona(body.persona)) {
    return NextResponse.json(
      { success: false, error: 'Invalid persona' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const actor = await ensureDevTestAuthActor(persona);
  const response = NextResponse.json(
    {
      success: true,
      persona: actor.persona,
      userId: actor.clerkUserId,
      email: actor.email,
      profilePath: actor.profilePath,
    },
    { headers: NO_STORE_HEADERS }
  );

  applyDevTestAuthCookies(response, request, actor);
  return response;
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json(
    { success: true },
    { headers: NO_STORE_HEADERS }
  );

  clearDevTestAuthCookies(response);
  return applyNoStore(response);
}
