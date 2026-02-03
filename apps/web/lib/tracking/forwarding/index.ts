/**
 * Pixel Forwarding Service
 *
 * Orchestrates server-side forwarding of pixel events to:
 * 1. Jovie's own marketing pixels (always)
 * 2. Creator's configured pixels (when configured)
 */

import { and, sql as drizzleSql, eq, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  creatorPixels,
  type PixelEvent,
  type PixelForwardingStatus,
  pixelEvents,
} from '@/lib/db/schema/pixels';
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

type Platform = 'facebook' | 'google' | 'tiktok';
type JoviePlatform = 'jovie_facebook' | 'jovie_google' | 'jovie_tiktok';

const platformForwarders: Record<
  Platform,
  (
    event: ReturnType<typeof normalizeEvent>,
    config: PlatformConfig
  ) => Promise<ForwardingResult>
> = {
  facebook: forwardToFacebook,
  google: forwardToGoogle,
  tiktok: forwardToTikTok,
};

const joviePlatformMap: Record<Platform, JoviePlatform> = {
  facebook: 'jovie_facebook',
  google: 'jovie_google',
  tiktok: 'jovie_tiktok',
};

/**
 * Forward event to all configured platforms
 */
async function forwardToPlatforms(
  normalizedEvent: ReturnType<typeof normalizeEvent>,
  configs: Partial<Record<Platform, PlatformConfig | null>>,
  isJovie = false
): Promise<ForwardingResult[]> {
  const results: ForwardingResult[] = [];

  for (const [platform, config] of Object.entries(configs) as [
    Platform,
    PlatformConfig | null,
  ][]) {
    if (config) {
      const forwarder = platformForwarders[platform];
      const result = await forwarder(normalizedEvent, config);
      const platformName = isJovie ? joviePlatformMap[platform] : platform;
      results.push({ ...result, platform: platformName });
    }
  }

  return results;
}

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
 * Mark event as skipped in the database
 */
async function markEventSkipped(
  eventId: string,
  reason: string
): Promise<void> {
  const skippedStatus: PixelForwardingStatus = {
    skipped: {
      status: 'skipped',
      sentAt: new Date().toISOString(),
      error: reason,
    },
  };

  await db
    .update(pixelEvents)
    .set({ forwardingStatus: skippedStatus })
    .where(eq(pixelEvents.id, eventId));
}

/**
 * Forward event to Jovie's own pixels
 */
async function forwardToJoviePixels(
  normalizedEvent: ReturnType<typeof normalizeEvent>
): Promise<ForwardingResult[]> {
  const jovieConfigs = getJoviePixelConfigs();
  return forwardToPlatforms(normalizedEvent, jovieConfigs, true);
}

/**
 * Forward event to creator's configured pixels
 */
async function forwardToCreatorPixels(
  normalizedEvent: ReturnType<typeof normalizeEvent>,
  profileId: string
): Promise<ForwardingResult[]> {
  const [creatorConfig] = await db
    .select()
    .from(creatorPixels)
    .where(eq(creatorPixels.profileId, profileId))
    .limit(1);

  if (!creatorConfig?.enabled) {
    return [];
  }

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

  return forwardToPlatforms(normalizedEvent, platformConfigs);
}

/**
 * Build forwarding status from results
 */
function buildForwardingStatus(
  results: ForwardingResult[]
): PixelForwardingStatus {
  const forwardingStatus: PixelForwardingStatus = {};

  if (results.length === 0) {
    forwardingStatus['skipped'] = {
      status: 'skipped',
      sentAt: new Date().toISOString(),
      error: 'no_platforms_configured',
    };
    return forwardingStatus;
  }

  for (const result of results) {
    forwardingStatus[result.platform] = {
      status: result.success ? 'sent' : 'failed',
      sentAt: new Date().toISOString(),
      ...(result.error && { error: result.error }),
    };
  }

  return forwardingStatus;
}

/**
 * Forward a single event to all configured platforms
 */
export async function forwardEvent(
  event: PixelEvent
): Promise<ForwardingResult[]> {
  const normalizedEvent = normalizeEvent(event);

  // Only forward if consent was given - mark as skipped to prevent retries
  if (!event.consentGiven) {
    logger.info('[Pixel Forwarding] Skipping event without consent', {
      eventId: event.id,
    });
    await markEventSkipped(event.id, 'consent_not_given');
    return [];
  }

  // Forward to all configured platforms
  const jovieResults = await forwardToJoviePixels(normalizedEvent);
  const creatorResults = await forwardToCreatorPixels(
    normalizedEvent,
    event.profileId
  );
  const results = [...jovieResults, ...creatorResults];

  // Update event with forwarding status
  const forwardingStatus = buildForwardingStatus(results);
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
            drizzleSql`${pixelEvents.forwardingStatus}::jsonb @> '{"facebook":{"status":"failed"}}'::jsonb`,
            drizzleSql`${pixelEvents.forwardingStatus}::jsonb @> '{"google":{"status":"failed"}}'::jsonb`,
            drizzleSql`${pixelEvents.forwardingStatus}::jsonb @> '{"tiktok":{"status":"failed"}}'::jsonb`,
            drizzleSql`${pixelEvents.forwardingStatus}::jsonb @> '{"jovie_facebook":{"status":"failed"}}'::jsonb`,
            drizzleSql`${pixelEvents.forwardingStatus}::jsonb @> '{"jovie_google":{"status":"failed"}}'::jsonb`,
            drizzleSql`${pixelEvents.forwardingStatus}::jsonb @> '{"jovie_tiktok":{"status":"failed"}}'::jsonb`
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
