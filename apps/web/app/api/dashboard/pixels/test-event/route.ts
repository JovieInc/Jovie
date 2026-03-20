import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
import { users } from '@/lib/db/schema/auth';
import { creatorPixels } from '@/lib/db/schema/pixels';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import { forwardToFacebook } from '@/lib/tracking/forwarding/facebook';
import { forwardToGoogle } from '@/lib/tracking/forwarding/google';
import { forwardToTikTok } from '@/lib/tracking/forwarding/tiktok';
import type {
  NormalizedEvent,
  PlatformConfig,
} from '@/lib/tracking/forwarding/types';
import { logger } from '@/lib/utils/logger';
import { decryptPII } from '@/lib/utils/pii-encryption';

export const runtime = 'nodejs';

const testEventSchema = z.object({
  platform: z.enum(['facebook', 'google', 'tiktok']),
});

type TestEventInput = z.infer<typeof testEventSchema>;

/**
 * POST /api/dashboard/pixels/test-event
 *
 * Sends a synthetic test event to the specified ad platform to verify
 * pixel configuration and credentials. Does not store in pixel_events.
 */
export async function POST(req: Request) {
  try {
    const entitlements = await getCurrentUserEntitlements();
    if (!entitlements.canAccessAdPixels) {
      return NextResponse.json(
        {
          error:
            'Ad pixels require a Pro plan. Upgrade to unlock this feature.',
        },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    return await withDbSessionTx(async (tx, clerkUserId) => {
      // Parse request body
      const parsedBody = await parseJsonBody<TestEventInput>(req, {
        route: 'POST /api/dashboard/pixels/test-event',
        headers: NO_STORE_HEADERS,
      });

      if (!parsedBody.ok) {
        return parsedBody.response;
      }

      // Validate input
      const validation = testEventSchema.safeParse(parsedBody.data);
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: validation.error.flatten() },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const { platform } = validation.data;

      // Get user's profile with username
      const [userProfile] = await tx
        .select({
          profileId: creatorProfiles.id,
          username: creatorProfiles.username,
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

      // Fetch pixel config
      const [pixelConfig] = await tx
        .select()
        .from(creatorPixels)
        .where(eq(creatorPixels.profileId, userProfile.profileId))
        .limit(1);

      if (!pixelConfig) {
        return NextResponse.json(
          {
            error: 'No pixel configuration found. Configure your pixels first.',
          },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      // Extract and decrypt credentials for the specified platform
      let config: PlatformConfig | null = null;

      if (platform === 'facebook') {
        const pixelId = pixelConfig.facebookPixelId;
        const accessToken = decryptPII(pixelConfig.facebookAccessToken);
        if (pixelId && accessToken && pixelConfig.facebookEnabled) {
          config = { pixelId, accessToken, enabled: true };
        }
      } else if (platform === 'google') {
        const pixelId = pixelConfig.googleMeasurementId;
        const accessToken = decryptPII(pixelConfig.googleApiSecret);
        if (pixelId && accessToken && pixelConfig.googleEnabled) {
          config = { pixelId, accessToken, enabled: true };
        }
      } else if (platform === 'tiktok') {
        const pixelId = pixelConfig.tiktokPixelId;
        const accessToken = decryptPII(pixelConfig.tiktokAccessToken);
        if (pixelId && accessToken && pixelConfig.tiktokEnabled) {
          config = { pixelId, accessToken, enabled: true };
        }
      }

      if (!config) {
        return NextResponse.json(
          {
            error: `${platform} pixel is not configured or is disabled. Add credentials first.`,
          },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      // Build synthetic test event
      const testEvent: NormalizedEvent = {
        eventId: `test_${userProfile.profileId}_${Date.now()}`,
        eventType: 'page_view',
        sourceUrl: `https://jov.ie/${userProfile.username}`,
        eventTime: Math.floor(Date.now() / 1000),
        ipHash: 'test',
      };

      // Forward to the specified platform
      let result;
      if (platform === 'facebook') {
        result = await forwardToFacebook(testEvent, config);
      } else if (platform === 'google') {
        result = await forwardToGoogle(testEvent, config);
      } else {
        result = await forwardToTikTok(testEvent, config);
      }

      logger.info('[Pixels Test] Test event sent', {
        profileId: userProfile.profileId,
        platform,
        success: result.success,
        error: result.error,
      });

      return NextResponse.json(
        {
          success: result.success,
          error: result.error,
          platform,
        },
        { headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    logger.error('[Pixels Test] Error sending test event:', error);
    if (!(error instanceof Error && error.message === 'Unauthorized')) {
      await captureError('Pixel test event failed', error, {
        route: '/api/dashboard/pixels/test-event',
        method: 'POST',
      });
    }
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Failed to send test event' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
