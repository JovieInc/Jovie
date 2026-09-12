import { z } from 'zod';
import { NATIVE_YOUTUBE_EXPERIMENT_REQUIRED } from '@/lib/workflows/youtube-packaging/thumbnail-mutation-policy';
import { YOUTUBE_THUMBNAIL_CANDIDATE_KIND } from './suggested-action-kinds';

export const YOUTUBE_THUMBNAIL_ARTIFACT_SHA256_PATTERN = /^[a-f0-9]{64}$/;

const ApiMetricSnapshotSchema = z.object({
  source: z.literal('youtube-analytics-api'),
  window: z.literal('lifetime'),
  capturedAt: z.string().datetime(),
  views: z.number().int().nonnegative().nullable(),
  watchTimeMinutes: z.number().nonnegative().nullable(),
  avgViewDurationSeconds: z.number().nonnegative().nullable(),
  impressions: z.null(),
  ctr: z.null(),
});

export const YouTubeThumbnailCandidatePayloadSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().trim().min(1),
  creatorProfileId: z.string().uuid(),
  channelId: z.string().trim().min(1),
  youtubeVideoId: z.string().trim().min(1),
  videoTitle: z.string().trim().min(1),
  candidateThumbnailVersionId: z.string().uuid(),
  candidateImageUrl: z.string().url(),
  currentThumbnailUrl: z.string().url().nullable(),
  artifactSha256: z.string().regex(YOUTUBE_THUMBNAIL_ARTIFACT_SHA256_PATTERN),
  apiMetrics: ApiMetricSnapshotSchema,
  publicationGate: z.object({
    state: z.literal('blocked'),
    reason: z.literal(NATIVE_YOUTUBE_EXPERIMENT_REQUIRED),
    requiredProof: z.tuple([
      z.literal('founder-candidate-approval'),
      z.literal('youtube-studio-native-experiment'),
      z.literal('provider-readback-receipt'),
    ]),
  }),
});

export type YouTubeThumbnailCandidatePayload = z.infer<
  typeof YouTubeThumbnailCandidatePayloadSchema
>;

export function parseYouTubeThumbnailCandidate(
  kind: string,
  payload: unknown
): YouTubeThumbnailCandidatePayload | null {
  if (kind !== YOUTUBE_THUMBNAIL_CANDIDATE_KIND) return null;
  const parsed = YouTubeThumbnailCandidatePayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export function buildYouTubeThumbnailCandidatePayload(
  input: Omit<
    YouTubeThumbnailCandidatePayload,
    'schemaVersion' | 'title' | 'publicationGate'
  >
): YouTubeThumbnailCandidatePayload {
  return {
    schemaVersion: 1,
    title: `Review thumbnail for ${input.videoTitle}`,
    ...input,
    publicationGate: {
      state: 'blocked',
      reason: NATIVE_YOUTUBE_EXPERIMENT_REQUIRED,
      requiredProof: [
        'founder-candidate-approval',
        'youtube-studio-native-experiment',
        'provider-readback-receipt',
      ],
    },
  };
}

export type YouTubeThumbnailDecision = 'approved' | 'rejected';

export function buildYouTubeThumbnailDecisionReceipt(input: {
  readonly payload: YouTubeThumbnailCandidatePayload;
  readonly decision: YouTubeThumbnailDecision;
  readonly decidedAt: Date;
}) {
  const { payload, decision, decidedAt } = input;
  return {
    schemaVersion: 1,
    state:
      decision === 'approved'
        ? ('approved-publication-blocked' as const)
        : ('rejected' as const),
    actionKind: YOUTUBE_THUMBNAIL_CANDIDATE_KIND,
    decision,
    decidedAt: decidedAt.toISOString(),
    creatorProfileId: payload.creatorProfileId,
    channelId: payload.channelId,
    youtubeVideoId: payload.youtubeVideoId,
    candidateThumbnailVersionId: payload.candidateThumbnailVersionId,
    candidateImageUrl: payload.candidateImageUrl,
    artifactSha256: payload.artifactSha256,
    apiEvidence: payload.apiMetrics,
    youtubeMutationPerformed: false,
    publicationGate:
      decision === 'approved'
        ? payload.publicationGate
        : {
            state: 'not-authorized' as const,
            reason: 'candidate-rejected' as const,
          },
  };
}
