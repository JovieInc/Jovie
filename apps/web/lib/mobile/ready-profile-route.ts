import { NextResponse } from 'next/server';
import { isProfileComplete } from '@/lib/auth/profile-completeness';
import { getSessionContext, SESSION_ERRORS } from '@/lib/auth/session';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { getMobileSessionUserId } from '@/lib/mobile/session-auth';

type MobileReadyProfile = {
  readonly clerkUserId: string;
  readonly profile: {
    readonly id: string;
    readonly username: string | null;
    readonly usernameNormalized: string | null;
    readonly displayName: string | null;
    readonly isPublic: boolean | null;
    readonly onboardingCompletedAt: Date | null;
  };
};

type MobileReadyProfileResult =
  | { readonly ok: true; readonly context: MobileReadyProfile }
  | { readonly ok: false; readonly response: NextResponse };

function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

export async function resolveMobileReadyProfile(
  request: Request
): Promise<MobileReadyProfileResult> {
  const clerkUserId = await getMobileSessionUserId(request);
  if (!clerkUserId) {
    return { ok: false, response: jsonError(401, 'Unauthorized') };
  }

  let session;
  try {
    session = await getSessionContext({
      clerkUserId,
      requireUser: true,
      requireProfile: false,
    });
  } catch (error) {
    if (
      error instanceof TypeError &&
      error.message === SESSION_ERRORS.USER_NOT_FOUND
    ) {
      return { ok: false, response: jsonError(404, 'Profile not found') };
    }
    throw error;
  }

  if (
    session.user.userStatus === 'banned' ||
    session.user.userStatus === 'suspended'
  ) {
    return { ok: false, response: jsonError(403, 'Forbidden') };
  }

  const { profile } = session;
  if (!profile) {
    return { ok: false, response: jsonError(404, 'Profile not found') };
  }

  if (
    !isProfileComplete({
      username: profile.username,
      usernameNormalized: profile.usernameNormalized,
      displayName: profile.displayName,
      isPublic: profile.isPublic,
      onboardingCompletedAt: profile.onboardingCompletedAt,
    })
  ) {
    return { ok: false, response: jsonError(404, 'Profile incomplete') };
  }

  return {
    ok: true,
    context: {
      clerkUserId,
      profile: {
        id: profile.id,
        username: profile.username,
        usernameNormalized: profile.usernameNormalized,
        displayName: profile.displayName,
        isPublic: profile.isPublic,
        onboardingCompletedAt: profile.onboardingCompletedAt,
      },
    },
  };
}
