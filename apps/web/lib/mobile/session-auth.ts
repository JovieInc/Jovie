import { NextResponse } from 'next/server';
import { getAppUserByBetterAuthId } from '@/lib/auth/app-user';
import { auth } from '@/lib/auth/better-auth';
import { getSessionContext } from '@/lib/auth/session';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

/**
 * Mobile session auth (Clerk → Better Auth migration, plan decision 9).
 *
 * The bearer plugin accepts the raw session token as a Bearer header
 * (`Authorization: Bearer <token>`). `auth.api.getSession` validates it
 * and returns the BA user. We then map the BA user id → app `users.id`
 * via `getAppUserByBetterAuthId` so downstream callers receive the app
 * uuid they expect (the same shape `getCachedAuth` returns for web).
 *
 * Returns `null` when the bearer token is missing, invalid, or expired.
 */
export async function getMobileSessionUserId(
  request: Request
): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return null;
    }

    // Map BA user id → app users.id. The mobile API contract historically
    // returned the Clerk user id; under BA it returns the app uuid, which
    // matches what `getCachedAuth` returns on web (commit ⑤'s identity flip).
    // Callers that keyed on the id shape (e.g. `requireMobileProfileSession`)
    // pass it to `getSessionContext({ clerkUserId: userId })` — that field
    // name is preserved for shape compat and now carries the app uuid.
    const appUser = await getAppUserByBetterAuthId(session.user.id);
    return appUser?.id ?? null;
  } catch (error) {
    // Bearer plugin throws on invalid/expired tokens — treat as signed-out.
    // Real failures (DB down) are captured so they're visible, but the API
    // still returns 401 rather than 500.
    if (
      error instanceof Error &&
      !error.message.toLowerCase().includes('unauthorized') &&
      !error.message.toLowerCase().includes('invalid') &&
      !error.message.toLowerCase().includes('expired')
    ) {
      await captureError('Mobile session auth failed', error, {
        operation: 'getMobileSessionUserId',
      });
    }
    return null;
  }
}

export async function requireMobileProfileSession(request: Request): Promise<
  | {
      readonly profile: NonNullable<
        Awaited<ReturnType<typeof getSessionContext>>['profile']
      >;
      readonly userId: string;
    }
  | { readonly errorResponse: NextResponse }
> {
  const userId = await getMobileSessionUserId(request);
  if (!userId) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const session = await getSessionContext({
    clerkUserId: userId,
    requireUser: true,
    requireProfile: false,
  });

  if (!session.profile) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return { profile: session.profile, userId };
}
