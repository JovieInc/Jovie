import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/auth/session';
import { resolveAlbumArtCapability } from '@/lib/chat/album-art-capability';
import { resolveRetouchCapability } from '@/lib/chat/retouch-capability';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { getAppFlagValue } from '@/lib/flags/server';
import { isXaiConfigured } from '@/lib/services/album-art/provider-xai';
import { isRetouchConfigured } from '@/lib/services/retouching/provider-gemini';
import { logger } from '@/lib/utils/logger';
import { getSessionErrorResponse } from '../session-error-response';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const profileId = url.searchParams.get('profileId');
    const { profile, user } = await getSessionContext({ requireProfile: true });

    if (!profile || (profileId && profileId !== profile.id)) {
      return NextResponse.json(
        { error: 'Profile not found or unauthorized' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const [entitlements, featureEnabled] = await Promise.all([
      getCurrentUserEntitlements().catch(() => null),
      getAppFlagValue('ALBUM_ART_GENERATION', { userId: user.id }),
    ]);
    const albumArt = resolveAlbumArtCapability({
      featureEnabled,
      providerConfigured: isXaiConfigured(),
      entitlements,
    });
    const retouch = resolveRetouchCapability({
      entitlements,
      provisioned: isRetouchConfigured(),
    });

    return NextResponse.json(
      {
        tools: {
          albumArt,
          retouch,
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error resolving chat capabilities:', error);
    const sessionErrorResponse = getSessionErrorResponse(
      error,
      NO_STORE_HEADERS
    );
    if (sessionErrorResponse) return sessionErrorResponse;

    return NextResponse.json(
      { error: 'Failed to resolve chat capabilities' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
