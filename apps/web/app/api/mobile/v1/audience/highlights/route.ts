import { NextResponse } from 'next/server';
import { isProfileComplete } from '@/lib/auth/profile-completeness';
import { getSessionContext, SESSION_ERRORS } from '@/lib/auth/session';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { buildMobileAudienceHighlights } from '@/lib/mobile/audience-highlights';
import { getMobileSessionUserId } from '@/lib/mobile/session-auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const userId = await getMobileSessionUserId(request);
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
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
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
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
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
      return NextResponse.json(
        { error: 'Profile incomplete' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const payload = await buildMobileAudienceHighlights(userId);

    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Mobile audience highlights route failed', error, {
      route: '/api/mobile/v1/audience/highlights',
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
