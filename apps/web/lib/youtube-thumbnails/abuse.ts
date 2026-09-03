import 'server-only';

import { createHash } from 'node:crypto';
import {
  getRedisClient,
  type RateLimitResult,
  youtubeThumbnailPreviewBurstLimiter,
} from '@/lib/rate-limit';
import { isDatacenterAsn } from '@/lib/utils/bot-detection';
import { logger } from '@/lib/utils/logger';

export const YOUTUBE_THUMBNAIL_CHANNEL_SPREAD_LIMIT = 3;
const SPREAD_TTL = 60 * 60 * 24;

export class PreviewAbuseError extends Error {
  readonly code: 'datacenter' | 'burst' | 'channel_spread';
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
