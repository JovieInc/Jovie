import 'server-only';

import { put } from '@vercel/blob';
import {
  getBlobCommandOptions,
  isBlobStorageConfigured,
} from '@/lib/blob-config';
import { getRedisClient } from '@/lib/rate-limit';
import {
  RETOUCH_MODEL_ID,
  RetouchGatewayUnconfiguredError,
  RetouchNoImageReturnedError,
  runRetouchModel,
} from '@/lib/services/retouching/provider-gemini';
import {
  buildRetouchPrompt,
  getRetouchStyleVersion,
} from '@/lib/services/retouching/style';
import { logger } from '@/lib/utils/logger';

/**
 * JOV-5862 thumbnail redo generation — anonymous paste-channel previews.
 *
 * Every generated redo is cached by (videoId, style version): a repeat view
 * of the same video serves the cached URL and never makes a new model call.
 * The blob path is deterministic for the same key, so even a cache miss after
 * eviction overwrites in place instead of accumulating storage.
 *
 * This path never touches retouch_jobs (user-keyed) or YouTube OAuth; it is
 * model spend only, gated by the generation budget guards in abuse.ts.
 */

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

const THUMBNAIL_REDO_DIRECTION = `Packaging pass for a YouTube thumbnail. Keep the same person, the same moment, and the same composition. Increase small-size legibility: cleaner background separation, clearer subject emphasis, and crisper contrast. Do not add text, logos, or new elements.`;

function styleScope(): string {
  return getRetouchStyleVersion().slice(0, 16);
}

function cacheKey(videoId: string): string {
  return `ytthumb:gen:v1:${styleScope()}:${videoId}`;
}

function blobPath(videoId: string, mediaType: string): string {
  const ext =
    mediaType === 'image/png'
      ? 'png'
      : mediaType === 'image/webp'
        ? 'webp'
        : 'jpg';
  return `youtube-thumbnails/redo/${videoId}/${styleScope()}.${ext}`;
}

export type ThumbnailRedoResult =
  | {
      readonly ok: true;
      readonly afterUrl: string;
      readonly cached: boolean;
      readonly model: string;
    }
  | {
      readonly ok: false;
      readonly code:
        | 'provider_unavailable'
        | 'guardrail_refusal'
        | 'generation_failed';
    };

/** Cached redo lookup — a hit means no new model call and no budget spend. */
export async function getCachedThumbnailRedo(
  videoId: string
): Promise<string | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const cached = await redis.get<string>(cacheKey(videoId));
    return typeof cached === 'string' && cached.startsWith('https://')
      ? cached
      : null;
  } catch (error) {
    logger.warn('[youtube-thumbnails] redo cache read failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Run one redo generation for a video's current thumbnail. Callers must have
 * already consumed the generation budget; this function spends model tokens.
 * Never throws for expected provider/guardrail outcomes.
 */
export async function generateThumbnailRedo(params: {
  readonly videoId: string;
  readonly beforeUrl: string;
}): Promise<ThumbnailRedoResult> {
  try {
    const generated = await runRetouchModel({
      sourceImageUrl: params.beforeUrl,
      prompt: buildRetouchPrompt({ instructions: THUMBNAIL_REDO_DIRECTION }),
    });

    if (!isBlobStorageConfigured()) {
      return { ok: false, code: 'provider_unavailable' };
    }
    const blob = await put(
      blobPath(params.videoId, generated.mediaType),
      generated.image,
      {
        access: 'public',
        ...getBlobCommandOptions(),
        contentType: generated.mediaType,
        cacheControlMaxAge: CACHE_TTL_SECONDS,
        addRandomSuffix: false,
      }
    );
    if (!blob.url?.startsWith('https://')) {
      throw new TypeError('Invalid blob URL returned from storage');
    }

    const redis = getRedisClient();
    if (redis) {
      await redis
        .set(cacheKey(params.videoId), blob.url, { ex: CACHE_TTL_SECONDS })
        .catch(error => {
          logger.warn('[youtube-thumbnails] redo cache write failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }

    return {
      ok: true,
      afterUrl: blob.url,
      cached: false,
      model: RETOUCH_MODEL_ID,
    };
  } catch (error) {
    if (error instanceof RetouchGatewayUnconfiguredError) {
      return { ok: false, code: 'provider_unavailable' };
    }
    if (error instanceof RetouchNoImageReturnedError) {
      return { ok: false, code: 'guardrail_refusal' };
    }
    logger.error('[youtube-thumbnails] redo generation failed', {
      videoId: params.videoId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, code: 'generation_failed' };
  }
}
