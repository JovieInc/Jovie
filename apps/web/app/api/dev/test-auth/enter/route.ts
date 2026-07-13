import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import {
  buildDevTestAuthCookieDescriptors,
  ensureDevTestAuthActor,
  getDevTestAuthAvailability,
  parseDevTestAuthPersona,
  sanitizeDevTestAuthRedirectPath,
} from '@/lib/auth/dev-test-auth.server';
import { isTrustedTestBypassRequest } from '@/lib/auth/test-mode';
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
  const redirectParam = request.nextUrl.searchParams.get('redirect');
  const parsedPersona = parseDevTestAuthPersona(personaParam);

  if (personaParam && !parsedPersona) {
    return NextResponse.json(
      { success: false, error: 'Invalid persona' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const persona = parsedPersona ?? 'creator';
  const redirectPath = sanitizeDevTestAuthRedirectPath(redirectParam);

  if (!redirectPath) {
    return NextResponse.json(
      { success: false, error: 'Redirect must be app-relative' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const actor = await ensureDevTestAuthActor(persona);
  revalidatePath(APP_ROUTES.DASHBOARD, 'layout');
  const response = new NextResponse(null, { status: 303 });

  response.headers.set('Cache-Control', NO_STORE_HEADERS['Cache-Control']);
  response.headers.set('Location', redirectPath);

  for (const cookie of buildDevTestAuthCookieDescriptors(
    actor,
    request.nextUrl.protocol === 'https:'
  )) {
    response.cookies.set(cookie);
  }

  return response;
}
