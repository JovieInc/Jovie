import { NextResponse } from 'next/server';
import { getAppUrl, getProfileUrl } from '@/constants/domains';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { isProfileComplete } from '@/lib/auth/profile-completeness';
import { getSessionContext, SESSION_ERRORS } from '@/lib/auth/session';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { isMobileChatEnabled } from '@/lib/mobile/chat/access';
import { getMobileSessionUserId } from '@/lib/mobile/session-auth';
import { isAppleWalletProfilePassAvailable } from '@/lib/wallet/apple/profile-pass';

export const runtime = 'nodejs';
const WAITLIST_PENDING_CAPABILITY = 'waitlist_pending';

export interface MobileMeResponse {
  state: 'ready' | 'needs_onboarding' | 'waitlist_pending';
  displayName: string | null;
  username: string | null;
  publicProfileUrl: string | null;
  qrPayload: string | null;
  avatarUrl: string | null;
  continueOnWebUrl: string;
  appleWalletProfilePassAvailable: boolean;
  chatEnabled: boolean;
  isAdmin: boolean;
}

function buildWaitlistPendingResponse(isAdmin: boolean): NextResponse {
  const payload: MobileMeResponse = {
    state: 'waitlist_pending',
    displayName: null,
    username: null,
    publicProfileUrl: null,
    qrPayload: null,
    avatarUrl: null,
    continueOnWebUrl: getAppUrl(),
    appleWalletProfilePassAvailable: false,
    chatEnabled: false,
    isAdmin,
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: NO_STORE_HEADERS,
  });
}

function buildNeedsOnboardingResponse(
  isAdmin: boolean,
  profile?: {
    readonly displayName: string | null;
    readonly username: string | null;
  }
): NextResponse {
  const payload: MobileMeResponse = {
    state: 'needs_onboarding',
    displayName: profile?.displayName ?? null,
    username: profile?.username ?? null,
    publicProfileUrl: null,
    qrPayload: null,
    avatarUrl: null,
    continueOnWebUrl: getAppUrl(),
    appleWalletProfilePassAvailable: false,
    chatEnabled: false,
    isAdmin,
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: NO_STORE_HEADERS,
  });
}

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
        return buildNeedsOnboardingResponse(false);
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

    const isAdminUser = await checkAdminRole(userId);

    if (session.user.userStatus === 'waitlist_pending') {
      const capabilities =
        request.headers.get('x-jovie-mobile-capabilities')?.split(',') ?? [];
      if (
        capabilities.some(
          capability => capability.trim() === WAITLIST_PENDING_CAPABILITY
        )
      ) {
        return buildWaitlistPendingResponse(isAdminUser);
      }
      return buildNeedsOnboardingResponse(isAdminUser);
    }

    const { profile } = session;
    if (!profile) {
      return buildNeedsOnboardingResponse(isAdminUser);
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
      return buildNeedsOnboardingResponse(isAdminUser, {
        displayName: profile.displayName,
        username: profile.username,
      });
    }

    const publicProfileUrl = getProfileUrl(profile.username!);
    const appleWalletProfilePassAvailable =
      await isAppleWalletProfilePassAvailable(userId, {
        id: profile.id,
        username: profile.username!,
        usernameNormalized: profile.usernameNormalized!,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        isPublic: profile.isPublic,
        onboardingCompletedAt: profile.onboardingCompletedAt,
      });
    const chatEnabled = await isMobileChatEnabled(userId);
    const payload: MobileMeResponse = {
      state: 'ready',
      displayName: profile.displayName,
      username: profile.username,
      publicProfileUrl,
      qrPayload: publicProfileUrl,
      avatarUrl: profile.avatarUrl,
      continueOnWebUrl: getAppUrl(),
      appleWalletProfilePassAvailable,
      chatEnabled,
      isAdmin: isAdminUser,
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
