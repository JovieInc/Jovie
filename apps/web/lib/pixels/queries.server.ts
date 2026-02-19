/**
 * Server-side pixel settings queries.
 *
 * Extracted from the /api/dashboard/pixels GET handler so the same
 * query logic can be reused for SSR prefetching in page server components.
 */

import { eq } from 'drizzle-orm';
import { withDbSessionTx } from '@/lib/auth/session';
import { users } from '@/lib/db/schema/auth';
import { creatorPixels } from '@/lib/db/schema/pixels';
import { creatorProfiles } from '@/lib/db/schema/profiles';

export interface PixelSettingsResponse {
  pixels: {
    facebookPixelId: string | null;
    googleMeasurementId: string | null;
    tiktokPixelId: string | null;
    enabled: boolean;
    facebookEnabled: boolean;
    googleEnabled: boolean;
    tiktokEnabled: boolean;
  };
  hasTokens: {
    facebook: boolean;
    google: boolean;
    tiktok: boolean;
  };
}

/**
 * Fetches pixel settings for the current authenticated user's profile.
 * Access tokens are NOT returned — only presence flags.
 *
 * @returns Pixel settings with token presence indicators
 * @throws Error if user is not authenticated or profile not found
 */
export async function getPixelSettingsForCurrentUser(): Promise<PixelSettingsResponse> {
  return withDbSessionTx(async (tx, clerkUserId) => {
    // Get user's profile
    const [userProfile] = await tx
      .select({
        profileId: creatorProfiles.id,
      })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!userProfile) {
      throw new Error('Profile not found');
    }

    // Get pixel settings (including token presence check, but not token values)
    const [pixelConfig] = await tx
      .select({
        facebookPixelId: creatorPixels.facebookPixelId,
        googleMeasurementId: creatorPixels.googleMeasurementId,
        tiktokPixelId: creatorPixels.tiktokPixelId,
        enabled: creatorPixels.enabled,
        facebookEnabled: creatorPixels.facebookEnabled,
        googleEnabled: creatorPixels.googleEnabled,
        tiktokEnabled: creatorPixels.tiktokEnabled,
        facebookAccessToken: creatorPixels.facebookAccessToken,
        googleApiSecret: creatorPixels.googleApiSecret,
        tiktokAccessToken: creatorPixels.tiktokAccessToken,
      })
      .from(creatorPixels)
      .where(eq(creatorPixels.profileId, userProfile.profileId))
      .limit(1);

    const hasTokens = {
      facebook: !!pixelConfig?.facebookAccessToken,
      google: !!pixelConfig?.googleApiSecret,
      tiktok: !!pixelConfig?.tiktokAccessToken,
    };

    const pixels = pixelConfig
      ? {
          facebookPixelId: pixelConfig.facebookPixelId,
          googleMeasurementId: pixelConfig.googleMeasurementId,
          tiktokPixelId: pixelConfig.tiktokPixelId,
          enabled: pixelConfig.enabled,
          facebookEnabled: pixelConfig.facebookEnabled,
          googleEnabled: pixelConfig.googleEnabled,
          tiktokEnabled: pixelConfig.tiktokEnabled,
        }
      : {
          facebookPixelId: null,
          googleMeasurementId: null,
          tiktokPixelId: null,
          enabled: true,
          facebookEnabled: true,
          googleEnabled: true,
          tiktokEnabled: true,
        };

    return { pixels, hasTokens };
  });
}
