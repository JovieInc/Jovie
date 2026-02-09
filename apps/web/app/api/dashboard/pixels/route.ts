import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
import { users } from '@/lib/db/schema/auth';
import { creatorPixels } from '@/lib/db/schema/pixels';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { parseJsonBody } from '@/lib/http/parse-json';
import { logger } from '@/lib/utils/logger';
import { encryptPII } from '@/lib/utils/pii-encryption';

const VALID_PLATFORMS = ['facebook', 'google', 'tiktok'] as const;
type PixelPlatform = (typeof VALID_PLATFORMS)[number];

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Input validation schema for pixel settings
 */
const pixelSettingsSchema = z.object({
  facebookPixelId: z.string().max(50).optional().default(''),
  facebookAccessToken: z.string().max(500).optional().default(''),
  googleMeasurementId: z.string().max(50).optional().default(''),
  googleApiSecret: z.string().max(200).optional().default(''),
  tiktokPixelId: z.string().max(50).optional().default(''),
  tiktokAccessToken: z.string().max(500).optional().default(''),
  enabled: z.boolean().optional().default(true),
});

type PixelSettingsInput = z.infer<typeof pixelSettingsSchema>;

/**
 * GET /api/dashboard/pixels
 *
 * Get current pixel settings for the authenticated user's profile.
 * Access tokens are not returned for security.
 */
export async function GET() {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
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
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
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
          // Token presence check (for hasTokens response)
          facebookAccessToken: creatorPixels.facebookAccessToken,
          googleApiSecret: creatorPixels.googleApiSecret,
          tiktokAccessToken: creatorPixels.tiktokAccessToken,
        })
        .from(creatorPixels)
        .where(eq(creatorPixels.profileId, userProfile.profileId))
        .limit(1);

      // Extract token presence (don't return actual token values)
      const hasTokens = {
        facebook: !!pixelConfig?.facebookAccessToken,
        google: !!pixelConfig?.googleApiSecret,
        tiktok: !!pixelConfig?.tiktokAccessToken,
      };

      // Build response without exposing token values
      const pixelsResponse = pixelConfig
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

      return NextResponse.json(
        {
          pixels: pixelsResponse,
          // Indicate whether tokens are configured (without revealing them)
          hasTokens,
        },
        { headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    logger.error('[Pixels GET] Error fetching pixel settings:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch pixel settings' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * PUT /api/dashboard/pixels
 *
 * Update pixel settings for the authenticated user's profile.
 * Access tokens are encrypted before storage.
 */
export async function PUT(req: Request) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      // Parse request body
      const parsedBody = await parseJsonBody<PixelSettingsInput>(req, {
        route: 'PUT /api/dashboard/pixels',
        headers: NO_STORE_HEADERS,
      });

      if (!parsedBody.ok) {
        return parsedBody.response;
      }

      // Validate input
      const validation = pixelSettingsSchema.safeParse(parsedBody.data);
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: validation.error.flatten() },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const input = validation.data;

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
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      // Check if config already exists (need to fetch before building encrypted data)
      const [existingConfig] = await tx
        .select()
        .from(creatorPixels)
        .where(eq(creatorPixels.profileId, userProfile.profileId))
        .limit(1);

      // Encrypt access tokens before storage
      // Preserve existing tokens if new ones are not provided
      const facebookAccessToken = input.facebookAccessToken
        ? encryptPII(input.facebookAccessToken)
        : existingConfig?.facebookAccessToken || null;
      const googleApiSecret = input.googleApiSecret
        ? encryptPII(input.googleApiSecret)
        : existingConfig?.googleApiSecret || null;
      const tiktokAccessToken = input.tiktokAccessToken
        ? encryptPII(input.tiktokAccessToken)
        : existingConfig?.tiktokAccessToken || null;

      // Preserve existing pixel IDs if new ones are not provided (same pattern as tokens)
      const facebookPixelId = input.facebookPixelId
        ? input.facebookPixelId
        : existingConfig?.facebookPixelId || null;
      const googleMeasurementId = input.googleMeasurementId
        ? input.googleMeasurementId
        : existingConfig?.googleMeasurementId || null;
      const tiktokPixelId = input.tiktokPixelId
        ? input.tiktokPixelId
        : existingConfig?.tiktokPixelId || null;

      const encryptedData = {
        facebookPixelId,
        facebookAccessToken,
        googleMeasurementId,
        googleApiSecret,
        tiktokPixelId,
        tiktokAccessToken,
        enabled: input.enabled,
        // Enable per-platform tracking based on whether credentials are configured
        // Use preserved IDs and tokens for enabled check
        facebookEnabled: !!(facebookPixelId && facebookAccessToken),
        googleEnabled: !!(googleMeasurementId && googleApiSecret),
        tiktokEnabled: !!(tiktokPixelId && tiktokAccessToken),
        updatedAt: new Date(),
      };

      if (existingConfig?.id) {
        // Update existing config
        await tx
          .update(creatorPixels)
          .set(encryptedData)
          .where(eq(creatorPixels.id, existingConfig.id));
      } else {
        // Create new config
        await tx.insert(creatorPixels).values({
          profileId: userProfile.profileId,
          ...encryptedData,
        });
      }

      logger.info('[Pixels PUT] Pixel settings updated', {
        profileId: userProfile.profileId,
        hasFacebook: !!input.facebookPixelId,
        hasGoogle: !!input.googleMeasurementId,
        hasTikTok: !!input.tiktokPixelId,
        enabled: input.enabled,
      });

      return NextResponse.json(
        { success: true },
        { headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    logger.error('[Pixels PUT] Error updating pixel settings:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update pixel settings' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * Platform-specific field nullification maps.
 * Used by DELETE to clear credentials for a single platform.
 */
const PLATFORM_CLEAR_FIELDS: Record<
  PixelPlatform,
  Record<string, null | boolean>
> = {
  facebook: {
    facebookPixelId: null,
    facebookAccessToken: null,
    facebookEnabled: false,
  },
  google: {
    googleMeasurementId: null,
    googleApiSecret: null,
    googleEnabled: false,
  },
  tiktok: {
    tiktokPixelId: null,
    tiktokAccessToken: null,
    tiktokEnabled: false,
  },
};

/**
 * DELETE /api/dashboard/pixels
 *
 * Delete pixel configuration for the authenticated user's profile.
 * Accepts an optional `platform` query parameter (facebook | google | tiktok)
 * to clear only that platform's credentials. Without it, deletes the entire row.
 */
export async function DELETE(req: Request) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      const url = new URL(req.url);
      const platform = url.searchParams.get('platform') as string | null;

      // Validate platform parameter if provided
      if (platform && !VALID_PLATFORMS.includes(platform as PixelPlatform)) {
        return NextResponse.json(
          {
            error: 'Invalid platform',
            details: `Must be one of: ${VALID_PLATFORMS.join(', ')}`,
          },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

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
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      // Find existing config
      const [existingConfig] = await tx
        .select({ id: creatorPixels.id })
        .from(creatorPixels)
        .where(eq(creatorPixels.profileId, userProfile.profileId))
        .limit(1);

      if (!existingConfig) {
        return NextResponse.json(
          { error: 'No pixel configuration found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      if (platform) {
        // Clear specific platform credentials
        await tx
          .update(creatorPixels)
          .set({
            ...PLATFORM_CLEAR_FIELDS[platform as PixelPlatform],
            updatedAt: new Date(),
          })
          .where(eq(creatorPixels.id, existingConfig.id));

        logger.info('[Pixels DELETE] Platform credentials cleared', {
          profileId: userProfile.profileId,
          platform,
        });
      } else {
        // Delete entire pixel config row
        await tx
          .delete(creatorPixels)
          .where(eq(creatorPixels.id, existingConfig.id));

        logger.info('[Pixels DELETE] All pixel settings deleted', {
          profileId: userProfile.profileId,
        });
      }

      return NextResponse.json(
        { success: true },
        { headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    logger.error('[Pixels DELETE] Error deleting pixel settings:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Failed to delete pixel settings' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
