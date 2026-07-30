import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import {
  buildBetterAuthSessionCookieDescriptor,
  buildDevTestAuthCookieDescriptors,
  ensureDevTestAuthActor,
  getDevTestAuthAvailability,
  getSyntheticDevTestAuthActor,
  parseDevTestAuthPersona,
  sanitizeDevTestAuthRedirectPath,
} from '@/lib/auth/dev-test-auth.server';
import {
  isTrustedTestBypassRequest,
  TEST_MODE_COOKIE,
} from '@/lib/auth/test-mode';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

/**
 * Prefer nextUrl.hostname, but fall back to Host / X-Forwarded-Host when the
 * standalone server URL host is the bind address (0.0.0.0) or the runner
 * HOSTNAME while the browser still hits loopback. Matches /session.
 */
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
      { success: false, error: availability.reason },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const personaParam = request.nextUrl.searchParams.get('persona');
  const sessionParam = request.nextUrl.searchParams.get('session');
  const redirectParam = request.nextUrl.searchParams.get('redirect');
  const parsedPersona = parseDevTestAuthPersona(personaParam);

  if (personaParam && !parsedPersona) {
    return NextResponse.json(
      { success: false, error: 'Invalid persona' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const persona = parsedPersona ?? 'creator';
  if (sessionParam && sessionParam !== 'better-auth') {
    return NextResponse.json(
      { success: false, error: 'Invalid session mode' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  const redirectPath = sanitizeDevTestAuthRedirectPath(redirectParam);

  if (!redirectPath) {
    return NextResponse.json(
      { success: false, error: 'Redirect must be app-relative' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  let actor;
  try {
    actor = await ensureDevTestAuthActor(persona);
  } catch (error) {
    // PR visual capture intentionally runs without a database or secrets. It
    // still needs the test-mode cookie handoff to reach the requested route;
    // target-route failures remain fail-closed in the capture manifest.
    if (
      process.env.E2E_VISUAL_CAPTURE_SYNTHETIC_AUTH !== '1' ||
      sessionParam === 'better-auth'
    ) {
      throw error;
    }

    actor = getSyntheticDevTestAuthActor(persona);
  }
  revalidatePath(APP_ROUTES.DASHBOARD, 'layout');
  const response = new NextResponse(null, { status: 303 });

  response.headers.set('Cache-Control', NO_STORE_HEADERS['Cache-Control']);
  response.headers.set('Location', redirectPath);

  const cookieDescriptors = buildDevTestAuthCookieDescriptors(
    actor,
    request.nextUrl.protocol === 'https:'
  );
  for (const cookie of cookieDescriptors) {
    if (sessionParam === 'better-auth' && cookie.name === TEST_MODE_COOKIE) {
      continue;
    }
    response.cookies.set(cookie);
  }
  if (sessionParam === 'better-auth') {
    response.cookies.set(
      await buildBetterAuthSessionCookieDescriptor(
        actor,
        request.nextUrl.protocol === 'https:'
      )
    );
  }

  return response;
}
