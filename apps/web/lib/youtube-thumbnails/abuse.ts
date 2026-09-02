import 'server-only';

import { createHash } from 'node:crypto';
import {
  getRedisClient,
  type RateLimitResult,
  youtubeThumbnailPreviewBurstLimiter,
  youtubeThumbnailPreviewChannelLimiter,
  youtubeThumbnailPreviewCooldownLimiter,
  youtubeThumbnailPreviewVisitorLimiter,
} from '@/lib/rate-limit';
import { isDatacenterAsn } from '@/lib/utils/bot-detection';
import { logger } from '@/lib/utils/logger';

/**
 * Abuse rules for the paste-channel thumbnail preview (JOV-5862).
 *
 * LLM gens are not cheap. "3 free" is SERVER-counted: 3 per visitor
 * (IP + device) AND 3 per channel — first cap wins. Cooldown between gens,
 * burst and datacenter hard-block, and rapid unique channels from one IP
 * hard-block. Everything here fails closed when Redis is missing (the
 * limiters are `requireRedis`), so an outage never opens free spend.
 */

export const YOUTUBE_THUMBNAIL_FREE_PREVIEWS = 3;
/** Distinct channels one IP may resolve per day before a hard block. */
export const YOUTUBE_THUMBNAIL_CHANNEL_SPREAD_LIMIT = 3;
const CHANNEL_SPREAD_TTL_SECONDS = 60 * 60 * 24;

export type PreviewAbuseCode =
  | 'datacenter'
  | 'burst'
  | 'cooldown'
  | 'visitor_limit'
  | 'channel_limit'
  | 'channel_spread';

export class PreviewAbuseError extends Error {
  readonly code: PreviewAbuseCode;
  readonly retryAfterSeconds: number | null;
  constructor(code: PreviewAbuseCode, retryAfterSeconds: number | null = null) {
    super(`Thumbnail preview blocked: ${code}`);
    this.name = 'PreviewAbuseError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Visitor identity = IP + device token, hashed. Never store raw IPs in keys. */
export function buildVisitorKey(ip: string, deviceId: string | null): string {
  return sha256(`${ip}|${deviceId ?? 'no-device'}`);
}

function retryAfterFrom(result: RateLimitResult): number {
  return Math.max(0, Math.ceil((result.reset.getTime() - Date.now()) / 1000));
}

export interface PreviewAbuseGuards {
  limitBurst(ip: string): Promise<RateLimitResult>;
  limitCooldown(visitorKey: string): Promise<RateLimitResult>;
  limitVisitor(visitorKey: string): Promise<RateLimitResult>;
  limitChannel(channelId: string): Promise<RateLimitResult>;
  /** Records the channel against the IP; returns the distinct count or null when untracked. */
  recordChannelForIp(ip: string, channelId: string): Promise<number | null>;
  isDatacenter(asn: number | undefined): boolean;
}

export const defaultPreviewAbuseGuards: PreviewAbuseGuards = {
  limitBurst: ip => youtubeThumbnailPreviewBurstLimiter.limit(`ip:${sha256(ip)}`),
  limitCooldown: visitorKey =>
    youtubeThumbnailPreviewCooldownLimiter.limit(`visitor:${visitorKey}`),
  limitVisitor: visitorKey =>
    youtubeThumbnailPreviewVisitorLimiter.limit(`visitor:${visitorKey}`),
  limitChannel: channelId =>
    youtubeThumbnailPreviewChannelLimiter.limit(`channel:${channelId}`),
  async recordChannelForIp(ip, channelId) {
    const redis = getRedisClient();
    if (!redis) return null;
    const key = `ytthumb:spread:v1:${sha256(ip)}`;
    try {
      await redis.sadd(key, channelId);
      await redis.expire(key, CHANNEL_SPREAD_TTL_SECONDS);
      return await redis.scard(key);
    } catch (error) {
      logger.warn('[youtube-thumbnails] channel-spread tracking failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },
  isDatacenter: asn => typeof asn === 'number' && isDatacenterAsn(asn),
};

/** Runs before any YouTube lookup: datacenter + per-IP burst. */
export async function assertRequestAdmitted(
  input: { readonly ip: string; readonly asn: number | undefined },
  guards: PreviewAbuseGuards = defaultPreviewAbuseGuards
): Promise<void> {
  if (guards.isDatacenter(input.asn)) {
    throw new PreviewAbuseError('datacenter');
  }
  const burst = await guards.limitBurst(input.ip);
  if (!burst.success) {
    throw new PreviewAbuseError('burst', retryAfterFrom(burst));
  }
}

/** Runs after a channel resolves: rapid unique channels from one IP = hard block. */
export async function assertChannelSpread(
  input: { readonly ip: string; readonly channelId: string },
  guards: PreviewAbuseGuards = defaultPreviewAbuseGuards
): Promise<void> {
  const distinct = await guards.recordChannelForIp(input.ip, input.channelId);
  if (distinct !== null && distinct > YOUTUBE_THUMBNAIL_CHANNEL_SPREAD_LIMIT) {
    throw new PreviewAbuseError('channel_spread', CHANNEL_SPREAD_TTL_SECONDS);
  }
}

/**
 * Runs only when a model call is about to happen. Cooldown, then the two
 * free caps — first cap wins. Returns the remaining free redos for the
 * tighter of the two caps.
 */
export async function assertGenerationAllowed(
  input: { readonly visitorKey: string; readonly channelId: string },
  guards: PreviewAbuseGuards = defaultPreviewAbuseGuards
): Promise<number> {
  const cooldown = await guards.limitCooldown(input.visitorKey);
  if (!cooldown.success) {
    throw new PreviewAbuseError('cooldown', retryAfterFrom(cooldown));
  }

  const [visitor, channel] = await Promise.all([
    guards.limitVisitor(input.visitorKey),
    guards.limitChannel(input.channelId),
  ]);
  if (!visitor.success) {
    throw new PreviewAbuseError('visitor_limit', retryAfterFrom(visitor));
  }
  if (!channel.success) {
    throw new PreviewAbuseError('channel_limit', retryAfterFrom(channel));
  }

  return Math.max(0, Math.min(visitor.remaining, channel.remaining));
}
