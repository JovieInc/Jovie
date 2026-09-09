import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  parseYouTubeThumbnailCandidate,
  YOUTUBE_THUMBNAIL_ARTIFACT_SHA256_PATTERN,
} from './youtube-thumbnail-candidate';

const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
const REQUIRED_WRITE_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

const RuntimeIdentitySchema = z.object({
  channelId: z.string().trim().min(1),
  channelTitle: z.string().trim().min(1),
  scopes: z.array(z.string().trim().min(1)),
});

export type YouTubeThumbnailApplyFailure =
  | 'invalid-approval'
  | 'stale-approval'
  | 'identity-mismatch'
  | 'scope-mismatch'
  | 'mapping-mismatch'
  | 'artifact-mismatch'
  | 'unsupported-media-type'
  | 'media-too-large'
  | 'replay'
  | 'provider-error'
  | 'ambiguous-provider-result';

export type YouTubeThumbnailApplyResult =
  | {
      readonly ok: true;
      readonly operationId: string;
      readonly beforeSha256: string;
      readonly afterSha256: string;
      readonly audit: {
        readonly schema: 'youtube-thumbnail-apply-receipt/v1';
        readonly channelId: string;
        readonly channelTitle: string;
        readonly scopes: readonly string[];
        readonly videoId: string;
        readonly videoTitle: string;
        readonly artifactSha256: string;
        readonly operationId: string;
      };
    }
  | { readonly ok: false; readonly error: YouTubeThumbnailApplyFailure };

export interface YouTubeThumbnailApplyProvider {
  setThumbnail(input: {
    readonly videoId: string;
    readonly mediaType: 'image/png' | 'image/jpeg';
    readonly bytes: Uint8Array;
  }): Promise<{
    readonly operationId: string;
    readonly beforeSha256: string;
    readonly afterSha256: string;
  }>;
}

export interface YouTubeThumbnailApplyInput {
  readonly approved: boolean;
  readonly approvalExpiresAt: Date;
  readonly payload: unknown;
  readonly runtimeIdentity: unknown;
  readonly videoId: string;
  readonly videoTitle: string;
  readonly artifactSha256: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly provider: YouTubeThumbnailApplyProvider;
  readonly hasApplied: boolean;
  readonly now?: Date;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function mediaTypeFor(bytes: Uint8Array): 'image/png' | 'image/jpeg' | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  return null;
}

export async function applyYouTubeThumbnail(
  input: YouTubeThumbnailApplyInput
): Promise<YouTubeThumbnailApplyResult> {
  const now = input.now ?? new Date();
  const payload = parseYouTubeThumbnailCandidate(
    'youtube.thumbnail_candidate',
    input.payload
  );
  const identity = RuntimeIdentitySchema.safeParse(input.runtimeIdentity);
  if (!payload || !identity.success || !input.videoTitle.trim()) {
    return { ok: false, error: 'invalid-approval' };
  }
  if (!input.approved) return { ok: false, error: 'stale-approval' };
  if (input.approvalExpiresAt.getTime() <= now.getTime()) {
    return { ok: false, error: 'stale-approval' };
  }
  if (identity.data.channelId !== payload.channelId) {
    return { ok: false, error: 'identity-mismatch' };
  }
  if (!identity.data.scopes.includes(REQUIRED_WRITE_SCOPE)) {
    return { ok: false, error: 'scope-mismatch' };
  }
  if (
    input.videoId !== payload.youtubeVideoId ||
    input.videoTitle.trim() !== payload.videoTitle
  ) {
    return { ok: false, error: 'mapping-mismatch' };
  }
  if (!YOUTUBE_THUMBNAIL_ARTIFACT_SHA256_PATTERN.test(input.artifactSha256)) {
    return { ok: false, error: 'artifact-mismatch' };
  }
  if (sha256(input.bytes) !== input.artifactSha256) {
    return { ok: false, error: 'artifact-mismatch' };
  }
  if (input.bytes.length > MAX_THUMBNAIL_BYTES) {
    return { ok: false, error: 'media-too-large' };
  }
  const detectedMediaType = mediaTypeFor(input.bytes);
  if (!detectedMediaType || input.mediaType !== detectedMediaType) {
    return { ok: false, error: 'unsupported-media-type' };
  }
  if (input.hasApplied) return { ok: false, error: 'replay' };

  let providerResult: Awaited<
    ReturnType<YouTubeThumbnailApplyProvider['setThumbnail']>
  >;
  try {
    providerResult = await input.provider.setThumbnail({
      videoId: input.videoId,
      mediaType: detectedMediaType,
      bytes: input.bytes,
    });
  } catch {
    return { ok: false, error: 'provider-error' };
  }
  if (
    !providerResult.operationId.trim() ||
    !YOUTUBE_THUMBNAIL_ARTIFACT_SHA256_PATTERN.test(
      providerResult.beforeSha256
    ) ||
    !YOUTUBE_THUMBNAIL_ARTIFACT_SHA256_PATTERN.test(
      providerResult.afterSha256
    ) ||
    providerResult.afterSha256 !== input.artifactSha256
  ) {
    return { ok: false, error: 'ambiguous-provider-result' };
  }

  return {
    ok: true,
    operationId: providerResult.operationId,
    beforeSha256: providerResult.beforeSha256,
    afterSha256: providerResult.afterSha256,
    audit: {
      schema: 'youtube-thumbnail-apply-receipt/v1',
      channelId: identity.data.channelId,
      channelTitle: identity.data.channelTitle,
      scopes: identity.data.scopes,
      videoId: input.videoId,
      videoTitle: input.videoTitle.trim(),
      artifactSha256: input.artifactSha256,
      operationId: providerResult.operationId,
    },
  };
}
