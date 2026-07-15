import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import {
  buildDevTestAuthCookieDescriptors,
  DEV_TEST_AUTH_COOKIE_NAMES,
  ensureDevTestAuthActor,
  ensureExistingDevTestAuthActor,
  getCachedDevTestAuthSession,
  getDevTestAuthAvailability,
  parseDevTestAuthPersona,
} from '@/lib/auth/dev-test-auth.server';
import { isTrustedTestBypassRequest } from '@/lib/auth/test-mode';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

function readPersonaFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }

  if (!('persona' in body)) {
    return null;
  }

  return typeof body.persona === 'string' ? body.persona : '';
}

function readExistingUserIdFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (!('existingUserId' in body)) return null;
  return typeof body.existingUserId === 'string'
    ? body.existingUserId.trim()
    : '';
}

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

function getRequestDevTestAuthAvailability(request: NextRequest) {
  const availability = getDevTestAuthAvailability(request.nextUrl.hostname);
  if (
    availability.trustedHost ||
    !availability.enabled ||
    !isTrustedTestBypassRequest(request.headers)
  ) {
    return availability;
  }

  return {
    enabled: true,
    trustedHost: true,
    reason: null,
  };
}

export async function GET(request: NextRequest) {
  const availability = getRequestDevTestAuthAvailability(request);

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
  const availability = getRequestDevTestAuthAvailability(request);

  if (!availability.enabled || !availability.trustedHost) {
    return NextResponse.json(
      {
        success: false,
        error: availability.reason,
      },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const rawBody = await request.json().catch(() => null);
  const requestedPersona = readPersonaFromBody(rawBody);
  const existingUserId = readExistingUserIdFromBody(rawBody);

  if (requestedPersona === '' || existingUserId === '') {
    return NextResponse.json(
      { success: false, error: 'Invalid persona' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const parsedPersona = parseDevTestAuthPersona(requestedPersona);
  const persona = parsedPersona ?? 'creator';

  if (requestedPersona && !parsedPersona) {
    return NextResponse.json(
      { success: false, error: 'Invalid persona' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const actor = existingUserId
    ? await ensureExistingDevTestAuthActor(existingUserId, parsedPersona)
    : await ensureDevTestAuthActor(persona);
  if (!actor) {
    return NextResponse.json(
      { success: false, error: 'Unknown Better Auth test user' },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }
  revalidatePath(APP_ROUTES.DASHBOARD, 'layout');
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
  const availability = getRequestDevTestAuthAvailability(request);

  if (!availability.enabled || !availability.trustedHost) {
    return NextResponse.json(
      {
        success: false,
        error: availability.reason,
      },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const response = NextResponse.json(
    { success: true },
    { headers: NO_STORE_HEADERS }
  );

  clearDevTestAuthCookies(response);
  return applyNoStore(response);
}
