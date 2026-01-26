/**
 * Pixel Forwarding Service
 *
 * Orchestrates server-side forwarding of pixel events to:
 * 1. Jovie's own marketing pixels (always)
 * 2. Creator's configured pixels (when configured)
 */

import { and, eq, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  creatorPixels,
  type PixelEvent,
  type PixelForwardingStatus,
  pixelEvents,
} from '@/lib/db/schema';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';
import { decryptPII } from '@/lib/utils/pii-encryption';
import { forwardToFacebook } from './facebook';
import { forwardToGoogle } from './google';
import { forwardToTikTok } from './tiktok';
import {
  extractPlatformConfigs,
  type ForwardingResult,
  normalizeEvent,
  type PlatformConfig,
} from './types';

export type {
  ForwardingResult,
  NormalizedEvent,
  PlatformConfig,
} from './types';

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

  // Only forward if consent was given - mark as skipped to prevent retries
  if (!event.consentGiven) {
    logger.info('[Pixel Forwarding] Skipping event without consent', {
      eventId: event.id,
    });

    // Mark event as skipped so cron doesn't keep retrying
    const skippedStatus: PixelForwardingStatus = {
      skipped: {
        status: 'skipped',
        sentAt: new Date().toISOString(),
        error: 'consent_not_given',
      },
    };

    await db
      .update(pixelEvents)
      .set({ forwardingStatus: skippedStatus })
      .where(eq(pixelEvents.id, event.id));

    return results;
  }

  // 1. Forward to Jovie's own pixels (marketing Jovie)
  const jovieConfigs = getJoviePixelConfigs();

  if (jovieConfigs.facebook) {
    const result = await forwardToFacebook(
      normalizedEvent,
      jovieConfigs.facebook
    );
    results.push({ ...result, platform: 'jovie_facebook' });
  }

  if (jovieConfigs.google) {
    const result = await forwardToGoogle(normalizedEvent, jovieConfigs.google);
    results.push({ ...result, platform: 'jovie_google' });
  }

  if (jovieConfigs.tiktok) {
    const result = await forwardToTikTok(normalizedEvent, jovieConfigs.tiktok);
    results.push({ ...result, platform: 'jovie_tiktok' });
  }

  // 2. Forward to creator's pixels (if configured)
  const [creatorConfig] = await db
    .select()
    .from(creatorPixels)
    .where(eq(creatorPixels.profileId, event.profileId))
    .limit(1);

  if (creatorConfig && creatorConfig.enabled) {
    // Decrypt access tokens (guard against null values)
    const decryptedConfig = {
      ...creatorConfig,
      facebookAccessToken: creatorConfig.facebookAccessToken
        ? decryptPII(creatorConfig.facebookAccessToken)
        : null,
      googleApiSecret: creatorConfig.googleApiSecret
        ? decryptPII(creatorConfig.googleApiSecret)
        : null,
      tiktokAccessToken: creatorConfig.tiktokAccessToken
        ? decryptPII(creatorConfig.tiktokAccessToken)
        : null,
    };

    const platformConfigs = extractPlatformConfigs(
      decryptedConfig as typeof creatorConfig
    );

    if (platformConfigs.facebook) {
      const result = await forwardToFacebook(
        normalizedEvent,
        platformConfigs.facebook
      );
      results.push(result);
    }

    if (platformConfigs.google) {
      const result = await forwardToGoogle(
        normalizedEvent,
        platformConfigs.google
      );
      results.push(result);
    }

    if (platformConfigs.tiktok) {
      const result = await forwardToTikTok(
        normalizedEvent,
        platformConfigs.tiktok
      );
      results.push(result);
    }
  }

  // Update event with forwarding status
  const forwardingStatus: Record<
    string,
    { status: string; sentAt: string; error?: string }
  > = {};

  // If no platforms configured, mark as skipped to prevent endless retries
  if (results.length === 0) {
    forwardingStatus['skipped'] = {
      status: 'skipped',
      sentAt: new Date().toISOString(),
      error: 'no_platforms_configured',
    };
  } else {
    for (const result of results) {
      forwardingStatus[result.platform] = {
        status: result.success ? 'sent' : 'failed',
        sentAt: new Date().toISOString(),
        ...(result.error && { error: result.error }),
      };
    }
  }

  await db
    .update(pixelEvents)
    .set({ forwardingStatus })
    .where(eq(pixelEvents.id, event.id));

  return results;
}

/**
 * Check if an event has any failed platform forwarding that needs retry
 */
function hasFailedForwarding(status: PixelForwardingStatus): boolean {
  return Object.values(status).some(platform => platform?.status === 'failed');
}

/**
 * Process a batch of events for forwarding
 * Called by cron job
 *
 * Selects events that:
 * 1. Have never been forwarded (empty forwardingStatus)
 * 2. Have failed forwarding and are due for retry (forwardAt <= now)
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
    // Get events that need forwarding:
    // - New events with empty forwardingStatus
    // - Failed events that are due for retry (forwardAt <= now)
    const pendingEvents = await db
      .select()
      .from(pixelEvents)
      .where(
        and(
          lte(pixelEvents.forwardAt, new Date()),
          or(
            eq(pixelEvents.forwardingStatus, {}),
            sql`${pixelEvents.forwardingStatus}::jsonb @> '{"facebook":{"status":"failed"}}'::jsonb`,
            sql`${pixelEvents.forwardingStatus}::jsonb @> '{"google":{"status":"failed"}}'::jsonb`,
            sql`${pixelEvents.forwardingStatus}::jsonb @> '{"tiktok":{"status":"failed"}}'::jsonb`,
            sql`${pixelEvents.forwardingStatus}::jsonb @> '{"jovie_facebook":{"status":"failed"}}'::jsonb`,
            sql`${pixelEvents.forwardingStatus}::jsonb @> '{"jovie_google":{"status":"failed"}}'::jsonb`,
            sql`${pixelEvents.forwardingStatus}::jsonb @> '{"jovie_tiktok":{"status":"failed"}}'::jsonb`
          )
        )
      )
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
          // Schedule retry with exponential backoff (5 min, 15 min, 45 min, etc.)
          // Count existing retries by checking for failed status
          const retryCount = hasFailedForwarding(event.forwardingStatus || {})
            ? 1
            : 0;
          const backoffMinutes = Math.min(5 * Math.pow(3, retryCount), 180); // Max 3 hours
          const nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000);

          await db
            .update(pixelEvents)
            .set({ forwardAt: nextRetry })
            .where(eq(pixelEvents.id, event.id));
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
