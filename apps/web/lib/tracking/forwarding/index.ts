/**
 * Pixel Forwarding Service
 *
 * Orchestrates server-side forwarding of pixel events to:
 * 1. Jovie's own marketing pixels (always)
 * 2. Creator's configured pixels (when configured)
 *
 * Primary forwarding happens inline via after() in /api/px.
 * The cron job handles retries for failed forwarding only.
 */

import { and, sql as drizzleSql, eq, inArray, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  creatorPixels,
  type CreatorPixel,
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
 * Forward event to all configured platforms in parallel
 */
async function forwardToPlatforms(
  normalizedEvent: ReturnType<typeof normalizeEvent>,
  configs: Partial<Record<Platform, PlatformConfig | null>>,
  isJovie = false
): Promise<ForwardingResult[]> {
  const tasks: Array<{
    platform: Platform;
    config: PlatformConfig;
  }> = [];

  for (const [platform, config] of Object.entries(configs) as [
    Platform,
    PlatformConfig | null,
  ][]) {
    if (config) {
      tasks.push({ platform, config });
    }
  }

  if (tasks.length === 0) return [];

  const settled = await Promise.allSettled(
    tasks.map(async ({ platform, config }) => {
      const forwarder = platformForwarders[platform];
      const result = await forwarder(normalizedEvent, config);
      const platformName = isJovie ? joviePlatformMap[platform] : platform;
      return { ...result, platform: platformName };
    })
  );

  return settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    const platformName = isJovie
      ? joviePlatformMap[tasks[i].platform]
      : tasks[i].platform;
    return {
      success: false,
      platform: platformName,
      error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
    };
  });
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
 * Decrypt and extract platform configs from a creator pixel record
 */
function decryptCreatorConfig(
  creatorConfig: CreatorPixel
): Partial<Record<Platform, PlatformConfig | null>> {
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

  return extractPlatformConfigs(
    decryptedConfig as typeof creatorConfig
  );
}

/**
 * Forward event to creator's configured pixels.
 * Accepts an optional pre-fetched config map (used by batch processing).
 */
async function forwardToCreatorPixels(
  normalizedEvent: ReturnType<typeof normalizeEvent>,
  profileId: string,
  creatorConfigMap?: Map<string, CreatorPixel>
): Promise<ForwardingResult[]> {
  let creatorConfig: CreatorPixel | undefined;

  if (creatorConfigMap) {
    creatorConfig = creatorConfigMap.get(profileId);
  } else {
    const [result] = await db
      .select()
      .from(creatorPixels)
      .where(eq(creatorPixels.profileId, profileId))
      .limit(1);
    creatorConfig = result;
  }

  if (!creatorConfig?.enabled) {
    return [];
  }

  const platformConfigs = decryptCreatorConfig(creatorConfig);
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
 * Check if forwarding status has any failed platforms
 */
function hasFailedForwarding(status: PixelForwardingStatus): boolean {
  return Object.values(status).some(platform => platform?.status === 'failed');
}

/**
 * Forward a single event to all configured platforms.
 * Called inline via after() for immediate forwarding, or by the retry cron.
 * Accepts an optional creator config map for batch processing efficiency.
 */
export async function forwardEvent(
  event: PixelEvent,
  creatorConfigMap?: Map<string, CreatorPixel>
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

  // Forward to all configured platforms in parallel
  const [jovieResults, creatorResults] = await Promise.all([
    forwardToJoviePixels(normalizedEvent),
    forwardToCreatorPixels(normalizedEvent, event.profileId, creatorConfigMap),
  ]);
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
 * Process a batch of events that need retry.
 * Called by the consolidated cron job.
 *
 * Now that primary forwarding happens inline via after(),
 * this only processes events that failed or were missed.
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
    // - New events with empty forwardingStatus (missed by after())
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

    if (pendingEvents.length === 0) {
      return { processed, successful, failed };
    }

    // Batch-fetch all creator pixel configs upfront (eliminates N+1)
    const profileIds = [...new Set(pendingEvents.map(e => e.profileId))];
    const creatorConfigs = await db
      .select()
      .from(creatorPixels)
      .where(
        and(
          inArray(creatorPixels.profileId, profileIds),
          eq(creatorPixels.enabled, true)
        )
      );
    const creatorConfigMap = new Map(
      creatorConfigs.map(c => [c.profileId, c])
    );

    for (const event of pendingEvents) {
      try {
        const results = await forwardEvent(event, creatorConfigMap);
        processed++;

        const allSuccessful = results.every(r => r.success);
        if (allSuccessful) {
          successful++;
        } else {
          failed++;
          // Schedule retry with exponential backoff
          // Count retries by number of existing failed statuses
          const failedCount = Object.values(
            event.forwardingStatus || {}
          ).filter(p => p?.status === 'failed').length;
          const retryCount = failedCount > 0 ? Math.min(failedCount, 5) : 0;
          const backoffMinutes = Math.min(
            5 * Math.pow(3, retryCount),
            180
          ); // Max 3 hours
          const nextRetry = new Date(
            Date.now() + backoffMinutes * 60 * 1000
          );

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
