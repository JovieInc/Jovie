import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getAppUrl, getProfileUrl } from '@/constants/domains';
import { isProfileComplete } from '@/lib/auth/profile-completeness';
import { getSessionContext, SESSION_ERRORS } from '@/lib/auth/session';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

export interface MobileMeResponse {
  state: 'ready' | 'needs_onboarding';
  displayName: string | null;
  username: string | null;
  publicProfileUrl: string | null;
  qrPayload: string | null;
  avatarUrl: string | null;
  continueOnWebUrl: string;
}

function buildNeedsOnboardingResponse(): NextResponse {
  const payload: MobileMeResponse = {
    state: 'needs_onboarding',
    displayName: null,
    username: null,
    publicProfileUrl: null,
    qrPayload: null,
    avatarUrl: null,
    continueOnWebUrl: getAppUrl(),
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: NO_STORE_HEADERS,
  });
}

export async function GET() {
  try {
    const { userId } = await auth({ acceptsToken: 'session_token' });
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    let session;
    try {
      session = await getSessionContext({
        clerkUserId: userId,
        requireUser: true,
        requireProfile: false,
      });
    } catch (error) {
      if (
        error instanceof TypeError &&
        error.message === SESSION_ERRORS.USER_NOT_FOUND
      ) {
        return buildNeedsOnboardingResponse();
      }
      throw error;
    }

    if (
      session.user.userStatus === 'banned' ||
      session.user.userStatus === 'suspended'
    ) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const { profile } = session;
    if (!profile) {
      return buildNeedsOnboardingResponse();
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
      return buildNeedsOnboardingResponse();
    }

    const publicProfileUrl = getProfileUrl(profile.username!);
    const payload: MobileMeResponse = {
      state: 'ready',
      displayName: profile.displayName,
      username: profile.username,
      publicProfileUrl,
      qrPayload: publicProfileUrl,
      avatarUrl: profile.avatarUrl,
      continueOnWebUrl: getAppUrl(),
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Mobile me route failed', error, {
      route: '/api/mobile/v1/me',
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
