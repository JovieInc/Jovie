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

export const YOUTUBE_THUMBNAIL_CHANNEL_SPREAD_LIMIT = 3;
const SPREAD_TTL = 60 * 60 * 24;

export class PreviewAbuseError extends Error {
  readonly code:
    | 'datacenter'
    | 'burst'
    | 'channel_spread'
    | 'cooldown'
    | 'visitor_cap'
    | 'channel_cap';
  readonly retryAfterSeconds: number | null;
  constructor(
    code: PreviewAbuseError['code'],
    retryAfterSeconds: number | null = null
  ) {
    super(`Thumbnail preview blocked: ${code}`);
    this.name = 'PreviewAbuseError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const retryAfterFrom = (result: RateLimitResult) =>
  Math.max(0, Math.ceil((result.reset.getTime() - Date.now()) / 1000));

const DEVICE_ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;

/**
 * JOV-5862 privacy contract: the visitor key is sha256(IP + device), never
 * the raw pair. A missing/malformed device id degrades to IP-only.
 */
export function parseThumbnailDeviceId(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return DEVICE_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function buildThumbnailVisitorKey(
  ip: string,
  deviceId: string | null
): string {
  return sha256(`${ip}:${deviceId ?? ''}`);
}

export interface PreviewAbuseGuards {
  limitBurst(ip: string): Promise<RateLimitResult>;
  recordChannelForIp(ip: string, channelId: string): Promise<number | null>;
  isDatacenter(asn: number | undefined): boolean;
}

export const defaultPreviewAbuseGuards: PreviewAbuseGuards = {
  limitBurst: ip =>
    youtubeThumbnailPreviewBurstLimiter.limit(`ip:${sha256(ip)}`),
  async recordChannelForIp(ip, channelId) {
    const redis = getRedisClient();
    if (!redis) return null;
    const key = `ytthumb:spread:v1:${sha256(ip)}`;
    try {
      await redis.sadd(key, channelId);
      await redis.expire(key, SPREAD_TTL);
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

/**
 * Server-counted generation budget guards (JOV-5862): cooldown between gens,
 * 3 free per visitor (IP + device), 3 free per channel — first cap wins. All
 * limiters are requireRedis (fail-closed): a degraded backend denies the
 * spend rather than falling open.
 */
export interface GenerationBudgetGuards {
  limitCooldown(visitorKey: string): Promise<RateLimitResult>;
  limitVisitor(visitorKey: string): Promise<RateLimitResult>;
  limitChannel(channelId: string): Promise<RateLimitResult>;
}

export const defaultGenerationBudgetGuards: GenerationBudgetGuards = {
  limitCooldown: visitorKey =>
    youtubeThumbnailPreviewCooldownLimiter.limit(`visitor:${visitorKey}`),
  limitVisitor: visitorKey =>
    youtubeThumbnailPreviewVisitorLimiter.limit(`visitor:${visitorKey}`),
  limitChannel: channelId =>
    youtubeThumbnailPreviewChannelLimiter.limit(`channel:${channelId}`),
};

export async function assertRequestAdmitted(
  input: { readonly ip: string; readonly asn: number | undefined },
  guards: PreviewAbuseGuards = defaultPreviewAbuseGuards
): Promise<void> {
  if (guards.isDatacenter(input.asn)) throw new PreviewAbuseError('datacenter');
  const burst = await guards.limitBurst(input.ip);
  if (!burst.success) {
    throw new PreviewAbuseError('burst', retryAfterFrom(burst));
  }
}

export async function assertChannelSpread(
  input: { readonly ip: string; readonly channelId: string },
  guards: PreviewAbuseGuards = defaultPreviewAbuseGuards
): Promise<void> {
  const distinct = await guards.recordChannelForIp(input.ip, input.channelId);
  if (distinct !== null && distinct > YOUTUBE_THUMBNAIL_CHANNEL_SPREAD_LIMIT) {
    throw new PreviewAbuseError('channel_spread', SPREAD_TTL);
  }
}

/**
 * Cooldown between generations, consumed once per request that actually
 * generates (cached results are free). Throws PreviewAbuseError('cooldown').
 */
export async function assertGenerationCooldown(
  input: { readonly visitorKey: string },
  guards: GenerationBudgetGuards = defaultGenerationBudgetGuards
): Promise<void> {
  const cooldown = await guards.limitCooldown(input.visitorKey);
  if (!cooldown.success) {
    throw new PreviewAbuseError('cooldown', retryAfterFrom(cooldown));
  }
}

/**
 * Consume one free generation from both caps — visitor first, then channel.
 * First cap to deny wins and no model call may happen afterwards. Returns the
 * visitor-cap result so callers can report `remaining` to the client.
 */
export async function consumeGenerationAllowance(
  input: { readonly visitorKey: string; readonly channelId: string },
  guards: GenerationBudgetGuards = defaultGenerationBudgetGuards
): Promise<RateLimitResult> {
  const visitor = await guards.limitVisitor(input.visitorKey);
  if (!visitor.success) {
    throw new PreviewAbuseError('visitor_cap', retryAfterFrom(visitor));
  }
  const channel = await guards.limitChannel(input.channelId);
  if (!channel.success) {
    throw new PreviewAbuseError('channel_cap', retryAfterFrom(channel));
  }
  return visitor;
}
