/**
 * Pixel Forwarding Service
 *
 * Orchestrates server-side forwarding of pixel events to:
 * 1. Jovie's own marketing pixels (always)
 * 2. Creator's configured pixels (when configured)
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorPixels, pixelEvents, type PixelEvent } from '@/lib/db/schema';
import { env } from '@/lib/env-server';
import { decryptPII } from '@/lib/utils/pii-encryption';
import { logger } from '@/lib/utils/logger';
import { forwardToFacebook } from './facebook';
import { forwardToGoogle } from './google';
import { forwardToTikTok } from './tiktok';
import {
  type ForwardingResult,
  type PlatformConfig,
  normalizeEvent,
  extractPlatformConfigs,
} from './types';

export type { ForwardingResult, NormalizedEvent, PlatformConfig } from './types';

/**
 * Get Jovie's own pixel configs from environment
 */
function getJoviePixelConfigs(): {
  facebook: PlatformConfig | null;
  google: PlatformConfig | null;
  tiktok: PlatformConfig | null;
} {
  return {
    facebook:
      env.JOVIE_FACEBOOK_PIXEL_ID && env.JOVIE_FACEBOOK_ACCESS_TOKEN
        ? {
            pixelId: env.JOVIE_FACEBOOK_PIXEL_ID,
            accessToken: env.JOVIE_FACEBOOK_ACCESS_TOKEN,
            enabled: true,
          }
        : null,
    google:
      env.JOVIE_GOOGLE_MEASUREMENT_ID && env.JOVIE_GOOGLE_API_SECRET
        ? {
            pixelId: env.JOVIE_GOOGLE_MEASUREMENT_ID,
            accessToken: env.JOVIE_GOOGLE_API_SECRET,
            enabled: true,
          }
        : null,
    tiktok:
      env.JOVIE_TIKTOK_PIXEL_ID && env.JOVIE_TIKTOK_ACCESS_TOKEN
        ? {
            pixelId: env.JOVIE_TIKTOK_PIXEL_ID,
            accessToken: env.JOVIE_TIKTOK_ACCESS_TOKEN,
            enabled: true,
          }
        : null,
  };
}

/**
 * Forward a single event to all configured platforms
 */
export async function forwardEvent(
  event: PixelEvent
): Promise<ForwardingResult[]> {
  const results: ForwardingResult[] = [];
  const normalizedEvent = normalizeEvent(event);

  // Only forward if consent was given
  if (!event.consentGiven) {
    logger.info('[Pixel Forwarding] Skipping event without consent', {
      eventId: event.id,
    });
    return results;
  }

  // 1. Forward to Jovie's own pixels (marketing Jovie)
  const jovieConfigs = getJoviePixelConfigs();

  if (jovieConfigs.facebook) {
    const result = await forwardToFacebook(normalizedEvent, jovieConfigs.facebook);
    results.push({ ...result, platform: 'jovie' });
  }

  if (jovieConfigs.google) {
    const result = await forwardToGoogle(normalizedEvent, jovieConfigs.google);
    results.push({ ...result, platform: 'jovie' });
  }

  if (jovieConfigs.tiktok) {
    const result = await forwardToTikTok(normalizedEvent, jovieConfigs.tiktok);
    results.push({ ...result, platform: 'jovie' });
  }

  // 2. Forward to creator's pixels (if configured)
  const [creatorConfig] = await db
    .select()
    .from(creatorPixels)
    .where(eq(creatorPixels.profileId, event.profileId))
    .limit(1);

  if (creatorConfig && creatorConfig.enabled) {
    // Decrypt access tokens
    const decryptedConfig = {
      ...creatorConfig,
      facebookAccessToken: decryptPII(creatorConfig.facebookAccessToken),
      googleApiSecret: decryptPII(creatorConfig.googleApiSecret),
      tiktokAccessToken: decryptPII(creatorConfig.tiktokAccessToken),
    };

    const platformConfigs = extractPlatformConfigs(decryptedConfig as typeof creatorConfig);

    if (platformConfigs.facebook) {
      const result = await forwardToFacebook(normalizedEvent, platformConfigs.facebook);
      results.push(result);
    }

    if (platformConfigs.google) {
      const result = await forwardToGoogle(normalizedEvent, platformConfigs.google);
      results.push(result);
    }

    if (platformConfigs.tiktok) {
      const result = await forwardToTikTok(normalizedEvent, platformConfigs.tiktok);
      results.push(result);
    }
  }

  // Update event with forwarding status
  const forwardingStatus: Record<string, { status: string; sentAt: string; error?: string }> = {};

  for (const result of results) {
    forwardingStatus[result.platform] = {
      status: result.success ? 'sent' : 'failed',
      sentAt: new Date().toISOString(),
      ...(result.error && { error: result.error }),
    };
  }

  await db
    .update(pixelEvents)
    .set({ forwardingStatus })
    .where(eq(pixelEvents.id, event.id));

  return results;
}

/**
 * Process a batch of events for forwarding
 * Called by cron job
 */
export async function processPendingEvents(limit = 100): Promise<{
  processed: number;
  successful: number;
  failed: number;
}> {
  let processed = 0;
  let successful = 0;
  let failed = 0;

  try {
    // Get events that haven't been forwarded yet
    const pendingEvents = await db
      .select()
      .from(pixelEvents)
      .where(eq(pixelEvents.forwardingStatus, {}))
      .limit(limit);

    for (const event of pendingEvents) {
      try {
        const results = await forwardEvent(event);
        processed++;

        const allSuccessful = results.every(r => r.success);
        if (allSuccessful) {
          successful++;
        } else {
          failed++;
        }
      } catch (error) {
        logger.error('[Pixel Forwarding] Event processing error', {
          eventId: event.id,
          error,
        });
        failed++;
        processed++;
      }
    }
  } catch (error) {
    logger.error('[Pixel Forwarding] Batch processing error', { error });
  }

  return { processed, successful, failed };
}
