import 'server-only';

import { put } from '@vercel/blob';
import sharp from 'sharp';
import { getBlobCommandOptions, isBlobStorageConfigured } from '@/lib/blob-config';
import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
import { getRedisClient } from '@/lib/rate-limit';
import {
  isRetouchConfigured,
  runRetouchModel,
} from '@/lib/services/retouching/provider-gemini';
import { logger } from '@/lib/utils/logger';
import {
  listRecentPublicVideos,
  parseYouTubeChannelInput,
  resolveYouTubeChannel,
  type YouTubeChannelRef,
  type YouTubeRecentVideo,
  type YouTubeResolvedChannel,
} from '@/lib/youtube/resolve-channel';
import {
  assertChannelSpread,
  assertGenerationAllowed,
  assertRequestAdmitted,
  buildVisitorKey,
  defaultPreviewAbuseGuards,
  type PreviewAbuseGuards,
} from './abuse';

/**
 * Paste-channel thumbnail preview (JOV-5862).
 *
 * Flow: admit request -> resolve channel (public Data API) -> three recent
 * public videos -> cached redo per video id + style -> generate only what
 * is missing, only when the generate flag is on, only inside the abuse caps.
 *
 * The generate half ships FLAGGED OFF (cert-sla-v1: default class waits on
 * Tim's Taste certify; spend is Tim's call). With the flag off the lander
 * still works end to end — paste, resolve, see your three current
 * thumbnails — with zero model spend. Dogfood recapture when it opens.
 */

export const YOUTUBE_THUMBNAIL_REDO_STYLE_ID = 'clarity-v1';
export const YOUTUBE_THUMBNAIL_PREVIEW_COUNT = 3;
export const YOUTUBE_THUMBNAIL_GENERATE_FLAG =
  'YOUTUBE_THUMBNAILS_PASTE_GENERATE' as const;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

export class InvalidChannelError extends Error {
  readonly code: 'invalid_channel' | 'no_videos';
  constructor(code: 'invalid_channel' | 'no_videos') {
    super(`Thumbnail preview rejected: ${code}`);
    this.name = 'InvalidChannelError';
    this.code = code;
  }
}

export interface ThumbnailPreviewItem {
  readonly videoId: string;
  readonly title: string;
  readonly beforeUrl: string;
  readonly afterUrl: string | null;
}

export interface ThumbnailPreviewResult {
  readonly channel: {
    readonly id: string;
    readonly title: string;
    readonly handle: string | null;
  };
  readonly mode: 'redo' | 'preview_only';
  readonly remaining: number | null;
  readonly items: readonly ThumbnailPreviewItem[];
}

export interface ThumbnailPreviewInput {
  readonly channelInput: string;
  readonly ip: string;
  readonly deviceId: string | null;
  readonly asn: number | undefined;
}

export interface ThumbnailPreviewCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export interface ThumbnailPreviewDeps {
  readonly resolveChannel: (
    ref: YouTubeChannelRef
  ) => Promise<YouTubeResolvedChannel | null>;
  readonly listVideos: (
    uploadsPlaylistId: string,
    limit: number
  ) => Promise<readonly YouTubeRecentVideo[]>;
  readonly isGenerationEnabled: () => boolean;
  /** Returns a public URL for the redo, or null when it could not be produced. */
  readonly generateRedo: (video: YouTubeRecentVideo) => Promise<string | null>;
  readonly cache: ThumbnailPreviewCache;
  readonly guards: PreviewAbuseGuards;
}

export function redoCacheKey(videoId: string): string {
  return `ytthumb:redo:v1:${videoId}:${YOUTUBE_THUMBNAIL_REDO_STYLE_ID}`;
}

/**
 * The prompt is the identity guardrail. Faces, bodies and people are never
 * generated, replaced or retouched — packaging only.
 */
export function buildRedoPrompt(videoTitle: string): string {
  return [
    'Redesign this YouTube thumbnail for clarity at small sizes.',
    'Keep every person exactly as they appear in the source: do not generate, replace, retouch, restyle or alter any face or body.',
    'Keep the real subject and setting. Remove visual clutter, raise contrast, simplify the color grade, and make the focal point unmistakable.',
    'If the source has title text, keep it to one short, bold, highly legible line; otherwise add none.',
    `Video title for context only: "${videoTitle.slice(0, 120)}".`,
    'No logos, no watermarks, no borders, no film grain. Output a 16:9 thumbnail.',
  ].join(' ');
}

const redisCache: ThumbnailPreviewCache = {
  async get(key) {
    const redis = getRedisClient();
    if (!redis) return null;
    try {
      const value = await redis.get<string>(key);
      return typeof value === 'string' && value.startsWith('https://')
        ? value
        : null;
    } catch (error) {
      logger.warn('[youtube-thumbnails] cache read failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },
  async set(key, value, ttlSeconds) {
    const redis = getRedisClient();
    if (!redis) return;
    try {
      await redis.set(key, value, { ex: ttlSeconds });
    } catch (error) {
      logger.warn('[youtube-thumbnails] cache write failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

async function uploadRedoPreview(params: {
  readonly videoId: string;
  readonly jpeg: Buffer;
}): Promise<string | null> {
  if (!isBlobStorageConfigured()) {
    logger.warn('[youtube-thumbnails] blob storage not configured; redo dropped', {
      videoId: params.videoId,
    });
    return null;
  }
  const path = `youtube-thumbnails/preview/${params.videoId}/${YOUTUBE_THUMBNAIL_REDO_STYLE_ID}.jpg`;
  const blob = await put(path, params.jpeg, {
    access: 'public',
    ...getBlobCommandOptions(),
    contentType: 'image/jpeg',
    cacheControlMaxAge: CACHE_TTL_SECONDS,
    addRandomSuffix: false,
  });
  return blob.url?.startsWith('https://') ? blob.url : null;
}

async function generateRedoWithGemini(
  video: YouTubeRecentVideo
): Promise<string | null> {
  try {
    const result = await runRetouchModel({
      sourceImageUrl: video.thumbnailUrl,
      prompt: buildRedoPrompt(video.title),
    });
    const jpeg = await sharp(result.image)
      .resize(1280, 720, { fit: 'cover' })
      .jpeg({ quality: 82 })
      .toBuffer();
    return await uploadRedoPreview({ videoId: video.videoId, jpeg });
  } catch (error) {
    logger.warn('[youtube-thumbnails] redo generation failed', {
      videoId: video.videoId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export const defaultThumbnailPreviewDeps: ThumbnailPreviewDeps = {
  resolveChannel: ref => resolveYouTubeChannel(ref),
  listVideos: (playlistId, limit) => listRecentPublicVideos(playlistId, limit),
  isGenerationEnabled: () =>
    isCodeFlagEnabled(YOUTUBE_THUMBNAIL_GENERATE_FLAG) && isRetouchConfigured(),
  generateRedo: generateRedoWithGemini,
  cache: redisCache,
  guards: defaultPreviewAbuseGuards,
};

export async function buildThumbnailPreview(
  input: ThumbnailPreviewInput,
  deps: ThumbnailPreviewDeps = defaultThumbnailPreviewDeps
): Promise<ThumbnailPreviewResult> {
  await assertRequestAdmitted({ ip: input.ip, asn: input.asn }, deps.guards);

  const ref = parseYouTubeChannelInput(input.channelInput);
  if (!ref) throw new InvalidChannelError('invalid_channel');

  const channel = await deps.resolveChannel(ref);
  if (!channel) throw new InvalidChannelError('invalid_channel');

  await assertChannelSpread(
    { ip: input.ip, channelId: channel.channelId },
    deps.guards
  );

  const videos = await deps.listVideos(
    channel.uploadsPlaylistId,
    YOUTUBE_THUMBNAIL_PREVIEW_COUNT
  );
  if (videos.length === 0) throw new InvalidChannelError('no_videos');

  const cached = await Promise.all(
    videos.map(video => deps.cache.get(redoCacheKey(video.videoId)))
  );

  const channelSummary = {
    id: channel.channelId,
    title: channel.title,
    handle: channel.handle,
  };

  const toItem = (
    video: YouTubeRecentVideo,
    afterUrl: string | null
  ): ThumbnailPreviewItem => ({
    videoId: video.videoId,
    title: video.title,
    beforeUrl: video.thumbnailUrl,
    afterUrl,
  });

  const everythingCached = cached.every(url => url !== null);
  if (everythingCached) {
    // Repeat = no new model call, no count consumed.
    return {
      channel: channelSummary,
      mode: 'redo',
      remaining: null,
      items: videos.map((video, index) => toItem(video, cached[index] ?? null)),
    };
  }

  if (!deps.isGenerationEnabled()) {
    return {
      channel: channelSummary,
      mode: 'preview_only',
      remaining: null,
      items: videos.map((video, index) => toItem(video, cached[index] ?? null)),
    };
  }

  const remaining = await assertGenerationAllowed(
    {
      visitorKey: buildVisitorKey(input.ip, input.deviceId),
      channelId: channel.channelId,
    },
    deps.guards
  );

  const items: ThumbnailPreviewItem[] = [];
  for (const [index, video] of videos.entries()) {
    const existing = cached[index] ?? null;
    if (existing) {
      items.push(toItem(video, existing));
      continue;
    }
    const afterUrl = await deps.generateRedo(video);
    if (afterUrl) {
      await deps.cache.set(
        redoCacheKey(video.videoId),
        afterUrl,
        CACHE_TTL_SECONDS
      );
    }
    items.push(toItem(video, afterUrl));
  }

  return { channel: channelSummary, mode: 'redo', remaining, items };
}
