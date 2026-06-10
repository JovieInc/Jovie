import { NextRequest, NextResponse } from 'next/server';
import { getCachedSessionTokenAuth } from '@/lib/auth/cached';
import { isProfileComplete } from '@/lib/auth/profile-completeness';
import { getSessionContext, withDbSessionTx } from '@/lib/auth/session';
import { verifyProfileOwnership } from '@/lib/db/queries/shared';
import { captureError } from '@/lib/error-tracking';
import { getAppFlagValue } from '@/lib/flags/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  AppleWalletConfigError,
  buildAppleWalletPassFileName,
  buildAppleWalletPassResponseHeaders,
  ensureAppleWalletProfilePass,
  generateAppleWalletProfilePassBuffer,
  isAppleWalletConfigured,
  loadAppleWalletProfile,
  recordAppleWalletPassDownload,
  toAppleWalletPassResponseBody,
} from '@/lib/wallet/apple/profile-pass';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { userId } = await getCachedSessionTokenAuth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const enabled = await getAppFlagValue('APPLE_WALLET_PROFILE_PASS', {
      userId,
    });
    if (!enabled) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (!isAppleWalletConfigured()) {
      return NextResponse.json(
        { error: 'Apple Wallet profile passes are not configured' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    const requestedProfileId = request.nextUrl.searchParams.get('profileId');
    const profileId =
      requestedProfileId ??
      (
        await getSessionContext({
          clerkUserId: userId,
          requireProfile: true,
        })
      ).profile?.id;
    if (!profileId) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const result = await withDbSessionTx(
      async (tx, clerkUserId) => {
        const ownedProfile = await verifyProfileOwnership(
          tx,
          profileId,
          clerkUserId
        );
        if (!ownedProfile) {
          return null;
        }

        const profile = await loadAppleWalletProfile(tx, profileId);
        if (!profile) return null;
        if (
          !isProfileComplete({
            username: profile.username,
            usernameNormalized: profile.usernameNormalized,
            displayName: profile.displayName,
            isPublic: profile.isPublic,
            onboardingCompletedAt: profile.onboardingCompletedAt,
          })
        ) {
          return 'incomplete' as const;
        }

        const passResult = await ensureAppleWalletProfilePass(tx, profile);
        return { ...passResult, handle: profile.username };
      },
      { clerkUserId: userId }
    );

    if (result === null) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    if (result === 'incomplete') {
      return NextResponse.json(
        { error: 'Complete your public profile before adding it to Wallet' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const buffer = await generateAppleWalletProfilePassBuffer(
      result.pass,
      result.authenticationToken
    );
    await withDbSessionTx(
      async tx => {
        await recordAppleWalletPassDownload(tx, result.pass.id);
      },
      { clerkUserId: userId }
    );

    return new NextResponse(toAppleWalletPassResponseBody(buffer), {
      status: 200,
      headers: buildAppleWalletPassResponseHeaders(
        buildAppleWalletPassFileName(result.handle)
      ),
    });
  } catch (error) {
    const status = error instanceof AppleWalletConfigError ? 503 : 500;
    await captureError('Apple Wallet profile pass route failed', error, {
      route: '/api/wallet/apple/profile-pass',
      userId,
    });
    return NextResponse.json(
      { error: 'Unable to generate Apple Wallet pass' },
      { status, headers: NO_STORE_HEADERS }
    );
  }
}
