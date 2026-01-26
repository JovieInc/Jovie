import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
import { creatorPixels, creatorProfiles, users } from '@/lib/db/schema';
import { parseJsonBody } from '@/lib/http/parse-json';
import { encryptPII } from '@/lib/utils/pii-encryption';
import { logger } from '@/lib/utils/logger';

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

      // Get pixel settings
      const [pixelConfig] = await tx
        .select({
          facebookPixelId: creatorPixels.facebookPixelId,
          googleMeasurementId: creatorPixels.googleMeasurementId,
          tiktokPixelId: creatorPixels.tiktokPixelId,
          enabled: creatorPixels.enabled,
          facebookEnabled: creatorPixels.facebookEnabled,
          googleEnabled: creatorPixels.googleEnabled,
          tiktokEnabled: creatorPixels.tiktokEnabled,
          // Note: Access tokens are NOT returned for security
        })
        .from(creatorPixels)
        .where(eq(creatorPixels.profileId, userProfile.profileId))
        .limit(1);

      return NextResponse.json(
        {
          pixels: pixelConfig || {
            facebookPixelId: null,
            googleMeasurementId: null,
            tiktokPixelId: null,
            enabled: true,
            facebookEnabled: true,
            googleEnabled: true,
            tiktokEnabled: true,
          },
          // Indicate whether tokens are configured (without revealing them)
          hasTokens: {
            facebook: !!pixelConfig?.facebookPixelId,
            google: !!pixelConfig?.googleMeasurementId,
            tiktok: !!pixelConfig?.tiktokPixelId,
          },
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

      // Encrypt access tokens before storage
      const encryptedData = {
        facebookPixelId: input.facebookPixelId || null,
        facebookAccessToken: input.facebookAccessToken
          ? encryptPII(input.facebookAccessToken)
          : null,
        googleMeasurementId: input.googleMeasurementId || null,
        googleApiSecret: input.googleApiSecret
          ? encryptPII(input.googleApiSecret)
          : null,
        tiktokPixelId: input.tiktokPixelId || null,
        tiktokAccessToken: input.tiktokAccessToken
          ? encryptPII(input.tiktokAccessToken)
          : null,
        enabled: input.enabled,
        // Enable per-platform tracking based on whether credentials are provided
        facebookEnabled: !!(input.facebookPixelId && input.facebookAccessToken),
        googleEnabled: !!(input.googleMeasurementId && input.googleApiSecret),
        tiktokEnabled: !!(input.tiktokPixelId && input.tiktokAccessToken),
        updatedAt: new Date(),
      };

      // Check if config already exists
      const [existingConfig] = await tx
        .select({ id: creatorPixels.id })
        .from(creatorPixels)
        .where(eq(creatorPixels.profileId, userProfile.profileId))
        .limit(1);

      if (existingConfig) {
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
