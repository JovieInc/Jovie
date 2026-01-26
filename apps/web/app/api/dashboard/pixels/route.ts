import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
import { creatorPixels, creatorProfiles, users } from '@/lib/db/schema';
import { parseJsonBody } from '@/lib/http/parse-json';
import { logger } from '@/lib/utils/logger';
import { encryptPII } from '@/lib/utils/pii-encryption';

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

      const encryptedData = {
        facebookPixelId: input.facebookPixelId || null,
        facebookAccessToken,
        googleMeasurementId: input.googleMeasurementId || null,
        googleApiSecret,
        tiktokPixelId: input.tiktokPixelId || null,
        tiktokAccessToken,
        enabled: input.enabled,
        // Enable per-platform tracking based on whether credentials are configured
        // Use either new token from input or preserved existing token
        facebookEnabled: !!(input.facebookPixelId && facebookAccessToken),
        googleEnabled: !!(input.googleMeasurementId && googleApiSecret),
        tiktokEnabled: !!(input.tiktokPixelId && tiktokAccessToken),
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
