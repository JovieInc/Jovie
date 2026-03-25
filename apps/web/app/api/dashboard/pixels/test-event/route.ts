import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { creatorPixels } from '@/lib/db/schema/pixels';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import { forwardToFacebook } from '@/lib/tracking/forwarding/facebook';
import { forwardToGoogle } from '@/lib/tracking/forwarding/google';
import { forwardToTikTok } from '@/lib/tracking/forwarding/tiktok';
import type {
  NormalizedEvent,
  PlatformConfig,
} from '@/lib/tracking/forwarding/types';
import { withPixelSession } from '@/lib/tracking/with-pixel-session';
import { logger } from '@/lib/utils/logger';
import { decryptPII } from '@/lib/utils/pii-encryption';

export const runtime = 'nodejs';

const testEventSchema = z.object({
  platform: z.enum(['facebook', 'google', 'tiktok']),
});

type TestEventInput = z.infer<typeof testEventSchema>;

function extractPlatformConfig(
  pixelConfig: typeof creatorPixels.$inferSelect,
  platform: TestEventInput['platform']
): PlatformConfig | null {
  const platformMap = {
    facebook: {
      pixelId: pixelConfig.facebookPixelId,
      accessToken: decryptPII(pixelConfig.facebookAccessToken),
      enabled: pixelConfig.facebookEnabled,
    },
    google: {
      pixelId: pixelConfig.googleMeasurementId,
      accessToken: decryptPII(pixelConfig.googleApiSecret),
      enabled: pixelConfig.googleEnabled,
    },
    tiktok: {
      pixelId: pixelConfig.tiktokPixelId,
      accessToken: decryptPII(pixelConfig.tiktokAccessToken),
      enabled: pixelConfig.tiktokEnabled,
    },
  } as const;

  const { pixelId, accessToken, enabled } = platformMap[platform];
  if (pixelId && accessToken && enabled) {
    return { pixelId, accessToken, enabled: true };
  }
  return null;
}

/**
 * POST /api/dashboard/pixels/test-event
 *
 * Sends a synthetic test event to the specified ad platform to verify
 * pixel configuration and credentials. Does not store in pixel_events.
 */
export async function POST(req: Request) {
  return withPixelSession(
    'Pixels Test',
    async (tx, { profileId, username }) => {
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

      // Fetch pixel config
      const [pixelConfig] = await tx
        .select()
        .from(creatorPixels)
        .where(eq(creatorPixels.profileId, profileId))
        .limit(1);

      if (!pixelConfig) {
        return NextResponse.json(
          {
            error: 'No pixel configuration found. Configure your pixels first.',
          },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      // Respect the master pixel toggle — live traffic is skipped when disabled,
      // so the test button should reflect the same behavior.
      if (!pixelConfig.enabled) {
        return NextResponse.json(
          {
            error:
              'Pixel tracking is globally disabled. Enable it first in settings.',
          },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      // Extract and decrypt credentials for the specified platform
      const config = extractPlatformConfig(pixelConfig, platform);

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
        eventId: `test_${profileId}_${Date.now()}`,
        eventType: 'page_view',
        sourceUrl: `https://jov.ie/${username}`,
        eventTime: Math.floor(Date.now() / 1000),
        ipHash: 'test',
      };

      // Forward to the specified platform
      const forwarders = {
        facebook: forwardToFacebook,
        google: forwardToGoogle,
        tiktok: forwardToTikTok,
      } as const;
      const result = await forwarders[platform](testEvent, config);

      logger.info('[Pixels Test] Test event sent', {
        profileId,
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
    }
  );
}
