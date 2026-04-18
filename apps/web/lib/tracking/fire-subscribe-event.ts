/**
 * Fire a Facebook CAPI "Subscribe" event when a fan confirms their notification subscription.
 *
 * This runs server-side and is called non-blocking (via `void`) from the subscribe
 * and verify-email-otp domain handlers. The hashed email improves Facebook's match
 * rate from ~30% to ~70%+, enabling better exclusion audiences for retargeting.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorPixels } from '@/lib/db/schema/pixels';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { checkBoolean } from '@/lib/entitlements/registry';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';
import { decryptPII } from '@/lib/utils/pii-encryption';
import { forwardToFacebook } from './forwarding/facebook';
import type { NormalizedEvent, PlatformConfig } from './forwarding/types';

interface FireSubscribeEventOptions {
  creatorProfileId: string;
  email?: string;
  phone?: string;
  ipAddress?: string;
  userAgent?: string;
  sourceUrl?: string;
}

/**
 * SHA-256 hash a string per Facebook's spec: lowercase, trim, hex-encoded.
 */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input.toLowerCase().trim());
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Fire a CAPI Subscribe event to both the creator's Facebook pixel and Jovie's
 * marketing pixel. Non-blocking — errors are logged but never thrown.
 */
export async function fireSubscribeCAPIEvent(
  opts: FireSubscribeEventOptions
): Promise<void> {
  try {
    const [hashedEmail, hashedPhone] = await Promise.all([
      opts.email ? sha256Hex(opts.email) : undefined,
      opts.phone ? sha256Hex(opts.phone) : undefined,
    ]);

    const normalizedEvent: NormalizedEvent = {
      eventId: `sub_${opts.creatorProfileId}_${Date.now()}`,
      eventType: 'subscribe',
      eventTime: Math.floor(Date.now() / 1000),
      sourceUrl: opts.sourceUrl || '',
      clientIp: opts.ipAddress,
      ipHash: '', // Not needed for direct CAPI calls
      userAgent: opts.userAgent,
      hashedEmail,
      hashedPhone,
    };

    // Collect all pixel configs to forward to
    const pixelConfigs: Array<{ config: PlatformConfig; label: string }> = [];

    // 1. Creator's own Facebook pixel (only if plan grants canAccessAdPixels)
    const [creatorResult] = await db
      .select({ pixels: creatorPixels, plan: users.plan })
      .from(creatorPixels)
      .innerJoin(
        creatorProfiles,
        eq(creatorProfiles.id, creatorPixels.profileId)
      )
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(creatorPixels.profileId, opts.creatorProfileId))
      .limit(1);

    if (
      creatorResult &&
      checkBoolean(creatorResult.plan, 'canAccessAdPixels') &&
      creatorResult.pixels.facebookPixelId &&
      creatorResult.pixels.facebookAccessToken &&
      creatorResult.pixels.facebookEnabled
    ) {
      const decryptedToken = decryptPII(
        creatorResult.pixels.facebookAccessToken
      );
      if (decryptedToken) {
        pixelConfigs.push({
          config: {
            pixelId: creatorResult.pixels.facebookPixelId,
            accessToken: decryptedToken,
            enabled: true,
          },
          label: 'creator',
        });
      }
    }

    // 2. Jovie's own marketing pixel
    if (env.JOVIE_FACEBOOK_PIXEL_ID && env.JOVIE_FACEBOOK_ACCESS_TOKEN) {
      pixelConfigs.push({
        config: {
          pixelId: env.JOVIE_FACEBOOK_PIXEL_ID,
          accessToken: env.JOVIE_FACEBOOK_ACCESS_TOKEN,
          enabled: true,
        },
        label: 'jovie',
      });
    }

    if (pixelConfigs.length === 0) {
      return;
    }

    // Fire all in parallel, non-blocking
    const results = await Promise.allSettled(
      pixelConfigs.map(({ config, label }) =>
        forwardToFacebook(normalizedEvent, config).then(result => {
          if (!result.success) {
            logger.error(`[CAPI Subscribe] ${label} forward failed`, {
              error: result.error,
              profileId: opts.creatorProfileId,
            });
          }
          return result;
        })
      )
    );

    const successCount = results.filter(
      r => r.status === 'fulfilled' && r.value.success
    ).length;

    if (successCount > 0) {
      logger.info('[CAPI Subscribe] Event sent', {
        profileId: opts.creatorProfileId,
        pixelCount: pixelConfigs.length,
        successCount,
      });
    }
  } catch (error) {
    // Never let tracking errors propagate — subscribe must always succeed
    logger.error('[CAPI Subscribe] Unexpected error', {
      error,
      profileId: opts.creatorProfileId,
    });
  }
}
