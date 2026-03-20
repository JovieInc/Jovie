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
import { users } from '@/lib/db/schema/auth';
import {
  type CreatorPixel,
  creatorPixels,
  type PixelEvent,
  type PixelForwardingStatus,
  pixelEvents,
} from '@/lib/db/schema/pixels';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { checkBoolean } from '@/lib/entitlements/registry';
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

const MAX_RETRIES = 5;

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
      const platformName = isJovie ? joviePlatformMap[platform] : platform;
      const start = Date.now();
      const result = await forwarder(normalizedEvent, config);
      const latencyMs = Date.now() - start;
      logger.info('[Pixel Metrics] Event forwarded', {
        platform: platformName,
        success: result.success,
        latency_ms: latencyMs,
        event_type: normalizedEvent.eventType,
        event_id: normalizedEvent.eventId,
      });
      return { ...result, platform: platformName };
    })
  );

  return settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    const platformName = isJovie
      ? joviePlatformMap[tasks[i].platform]
      : tasks[i].platform;
    logger.info('[Pixel Metrics] Event forwarded', {
      platform: platformName,
      success: false,
      latency_ms: -1,
      event_type: normalizedEvent.eventType,
      event_id: normalizedEvent.eventId,
    });
    return {
      success: false,
      platform: platformName,
      error:
        result.reason instanceof Error
          ? result.reason.message
          : 'Unknown error',
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

  return extractPlatformConfigs(decryptedConfig as typeof creatorConfig);
}

/**
 * Forward event to creator's configured pixels.
 * Accepts an optional pre-fetched config map (used by batch processing).
 * The config map must only contain entries for creators with canAccessAdPixels.
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
    // Fetch pixel config and join to users to verify plan entitlement.
    // Only forward creator pixels for users on a paid plan (canAccessAdPixels).
    const [result] = await db
      .select({ pixels: creatorPixels, plan: users.plan })
      .from(creatorPixels)
      .innerJoin(
        creatorProfiles,
        eq(creatorProfiles.id, creatorPixels.profileId)
      )
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(creatorPixels.profileId, profileId))
      .limit(1);

    if (!result || !checkBoolean(result.plan, 'canAccessAdPixels')) {
      return [];
    }
    creatorConfig = result.pixels;
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
function _hasFailedForwarding(status: PixelForwardingStatus): boolean {
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
  dead_lettered: number;
}> {
  const batchStart = Date.now();
  let processed = 0;
  let successful = 0;
  let failed = 0;
  let deadLettered = 0;

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
      return { processed, successful, failed, dead_lettered: deadLettered };
    }

    // Batch-fetch all creator pixel configs upfront (eliminates N+1).
    // Only include configs for creators on a paid plan (canAccessAdPixels).
    const profileIds = [...new Set(pendingEvents.map(e => e.profileId))];
    const creatorConfigRows = await db
      .select({ pixels: creatorPixels, plan: users.plan })
      .from(creatorPixels)
      .innerJoin(
        creatorProfiles,
        eq(creatorProfiles.id, creatorPixels.profileId)
      )
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(
        and(
          inArray(creatorPixels.profileId, profileIds),
          eq(creatorPixels.enabled, true)
        )
      );
    const creatorConfigMap = new Map(
      creatorConfigRows
        .filter(r => checkBoolean(r.plan, 'canAccessAdPixels'))
        .map(r => [r.pixels.profileId, r.pixels])
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
          const retryCount = event.retryCount ?? 0;

          if (retryCount >= MAX_RETRIES) {
            // Dead letter — stop retrying this event
            const deadLetterStatus: PixelForwardingStatus = {};
            for (const result of results) {
              deadLetterStatus[result.platform] = {
                status: result.success ? 'sent' : 'dead_letter',
                sentAt: new Date().toISOString(),
                ...(result.error && { error: result.error }),
              };
            }
            await db
              .update(pixelEvents)
              .set({ forwardingStatus: deadLetterStatus })
              .where(eq(pixelEvents.id, event.id));

            logger.warn('[Pixel Metrics] Dead letter', {
              eventId: event.id,
              platforms: results.filter(r => !r.success).map(r => r.platform),
              totalAttempts: retryCount + 1,
            });
            deadLettered++;
          } else {
            // Schedule retry with exponential backoff
            const backoffMinutes = Math.min(5 * Math.pow(3, retryCount), 180); // Max 3 hours
            const nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000);

            await db
              .update(pixelEvents)
              .set({
                forwardAt: nextRetry,
                retryCount: retryCount + 1,
              })
              .where(eq(pixelEvents.id, event.id));

            logger.info('[Pixel Metrics] Retry scheduled', {
              event_id: event.id,
              retry_count: retryCount + 1,
              next_retry_at: nextRetry.toISOString(),
            });
          }
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

  logger.info('[Pixel Metrics] Batch complete', {
    processed,
    successful,
    failed,
    dead_lettered: deadLettered,
    duration_ms: Date.now() - batchStart,
  });

  return { processed, successful, failed, dead_lettered: deadLettered };
}
