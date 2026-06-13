import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/auth/session';
import { getRequestClerkClient } from '@/lib/auth/request-clerk-client';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export async function getMobileSessionUserId(
  request: Request
): Promise<string | null> {
  const clerk = await getRequestClerkClient(request);
  const requestState = await clerk.authenticateRequest(request, {
    acceptsToken: 'session_token',
  });

  if (!requestState.isAuthenticated) {
    return null;
  }

  const authObject = requestState.toAuth();
  return typeof authObject.userId === 'string' ? authObject.userId : null;
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
    requireProfile: true,
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
