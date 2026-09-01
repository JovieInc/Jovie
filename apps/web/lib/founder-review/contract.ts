import { z } from 'zod';

export const FOUNDER_REVIEW_SCHEMA_VERSION = 1 as const;
export const FOUNDER_REVIEW_SOURCE = 'founder-inbox-review' as const;
export const FOUNDER_REVIEW_DISCLOSURE_VERSION = 1 as const;
export const FOUNDER_REVIEW_MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export const FOUNDER_REVIEW_AUDIO_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
] as const;

export const FounderReviewTargetSchema = z.object({
  type: z.enum(['inbox-card', 'founder-note']),
  id: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  sourceKind: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
});

export type FounderReviewTarget = z.infer<typeof FounderReviewTargetSchema>;

export const FounderReviewMediaSchema = z.object({
  blobUrl: z.string().url().startsWith('https://'),
  pathname: z.string().trim().min(1).max(1_000),
  contentType: z.enum(FOUNDER_REVIEW_AUDIO_TYPES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().positive().max(FOUNDER_REVIEW_MAX_AUDIO_BYTES),
  durationMs: z
    .number()
    .int()
    .positive()
    .max(60 * 60 * 1_000),
});

export type FounderReviewMedia = z.infer<typeof FounderReviewMediaSchema>;

const FounderReviewTranscriptionSchema = z.object({
  provider: z.enum(['web-speech', 'typed', 'mixed', 'none']),
  status: z.enum([
    'complete',
    'typed-only',
    'unsupported',
    'permission-denied',
    'failed',
  ]),
  errorCode: z.string().trim().max(80).nullable().default(null),
});

const FounderReviewRecordingSchema = z.object({
  startedAt: z.string().datetime({ offset: true }).nullable(),
  endedAt: z.string().datetime({ offset: true }),
  initiatedBy: z.enum(['button', 'keyboard', 'typed']),
  status: z.enum([
    'captured-discarded',
    'captured-retained',
    'not-captured',
    'failed',
  ]),
  retention: z.enum(['transcript-only', 'audio-and-transcript']),
  durationMs: z
    .number()
    .int()
    .nonnegative()
    .max(60 * 60 * 1_000)
    .nullable(),
  media: FounderReviewMediaSchema.nullable(),
});

const FounderReviewConsentSchema = z.object({
  disclosureVersion: z.literal(FOUNDER_REVIEW_DISCLOSURE_VERSION),
  contentUse: z.enum(['allowed', 'not-allowed']),
  capturedAt: z.string().datetime({ offset: true }),
});

export const CreateFounderReviewSchema = z
  .object({
    sessionId: z.string().uuid(),
    segmentId: z.string().uuid(),
    target: FounderReviewTargetSchema,
    decision: z.enum(['approved', 'rejected', 'deferred', 'note']),
    transcript: z.string().trim().max(12_000).default(''),
    typedText: z.string().trim().max(12_000).default(''),
    transcription: FounderReviewTranscriptionSchema,
    recording: FounderReviewRecordingSchema,
    consent: FounderReviewConsentSchema,
  })
  .superRefine((value, context) => {
    if (
      value.recording.retention === 'audio-and-transcript' &&
      !value.recording.media
    ) {
      context.addIssue({
        code: 'custom',
        path: ['recording', 'media'],
        message: 'Retained audio metadata is required.',
      });
    }
    if (
      value.recording.retention === 'transcript-only' &&
      value.recording.media
    ) {
      context.addIssue({
        code: 'custom',
        path: ['recording', 'media'],
        message: 'Transcript-only reviews cannot retain audio metadata.',
      });
    }
  });

export type CreateFounderReviewInput = z.infer<
  typeof CreateFounderReviewSchema
>;

export const StoredFounderReviewContextSchema = z.object({
  schemaVersion: z.literal(FOUNDER_REVIEW_SCHEMA_VERSION),
  sessionId: z.string().uuid(),
  segmentId: z.string().uuid(),
  target: FounderReviewTargetSchema,
  decision: z.enum(['approved', 'rejected', 'deferred', 'note']),
  transcript: z.string(),
  typedText: z.string(),
  transcription: FounderReviewTranscriptionSchema,
  recording: FounderReviewRecordingSchema.extend({
    deletedAt: z.string().datetime({ offset: true }).nullable(),
  }),
  consent: FounderReviewConsentSchema,
  rationaleExtractionStatus: z.enum(['pending', 'not-requested']),
  provenance: z.object({
    surface: z.literal('opportunity-inbox'),
    sourceBinding: z.string().min(1),
    founderMaterial: z.boolean(),
  }),
  authority: z.object({
    externalActionAuthorized: z.literal(false),
    exactContent: z.null(),
    destination: z.null(),
    requiresExplicitApproval: z.literal(true),
  }),
  pathname: z.string().max(512).nullable(),
  userAgent: z.string().max(1_000).nullable(),
  timestampIso: z.string().datetime({ offset: true }),
});

export type StoredFounderReviewContext = z.infer<
  typeof StoredFounderReviewContextSchema
>;

export interface FounderReviewReceipt {
  readonly schemaVersion: typeof FOUNDER_REVIEW_SCHEMA_VERSION;
  readonly id: string;
  readonly sessionId: string;
  readonly segmentId: string;
  readonly target: FounderReviewTarget;
  readonly decision: CreateFounderReviewInput['decision'];
  readonly transcript: string;
  readonly typedText: string;
  readonly transcription: CreateFounderReviewInput['transcription'];
  readonly recording: {
    readonly startedAt: string | null;
    readonly endedAt: string;
    readonly initiatedBy: CreateFounderReviewInput['recording']['initiatedBy'];
    readonly status: CreateFounderReviewInput['recording']['status'];
    readonly retention: CreateFounderReviewInput['recording']['retention'];
    readonly durationMs: number | null;
    readonly byteSize: number | null;
    readonly sha256: string | null;
    readonly mediaAvailable: boolean;
    readonly mediaPath: string | null;
    readonly deletedAt: string | null;
  };
  readonly consent: CreateFounderReviewInput['consent'];
  readonly rationaleExtractionStatus: 'pending' | 'not-requested';
  readonly provenance: StoredFounderReviewContext['provenance'];
  readonly authority: StoredFounderReviewContext['authority'];
  readonly createdAt: string;
}

export function founderReviewUserBlobPrefix(userId: string): string {
  return `founder-inbox-reviews/${userId}/`;
}

export function founderReviewBlobPrefix(input: {
  readonly userId: string;
  readonly sessionId: string;
  readonly segmentId: string;
  readonly target: Pick<FounderReviewTarget, 'type' | 'id' | 'sourceKind'>;
}): string {
  const targetKey = [
    input.target.type,
    input.target.id,
    input.target.sourceKind,
  ]
    .map(value => encodeURIComponent(value))
    .join('/');
  return `${founderReviewUserBlobPrefix(input.userId)}${input.sessionId}/${input.segmentId}/${targetKey}/`;
}

export function founderReviewMediaPath(reviewId: string): string {
  return `/api/inbox/founder-reviews/${reviewId}/media`;
}

export function buildStoredFounderReviewContext(input: {
  readonly review: CreateFounderReviewInput;
  readonly pathname: string | null;
  readonly userAgent: string | null;
  readonly capturedAt: string;
}): StoredFounderReviewContext {
  const text = `${input.review.transcript} ${input.review.typedText}`.trim();
  return {
    schemaVersion: FOUNDER_REVIEW_SCHEMA_VERSION,
    sessionId: input.review.sessionId,
    segmentId: input.review.segmentId,
    target: input.review.target,
    decision: input.review.decision,
    transcript: input.review.transcript,
    typedText: input.review.typedText,
    transcription: input.review.transcription,
    recording: {
      ...input.review.recording,
      deletedAt: null,
    },
    consent: input.review.consent,
    rationaleExtractionStatus: text ? 'pending' : 'not-requested',
    provenance: {
      surface: 'opportunity-inbox',
      sourceBinding: `${input.review.target.type}:${input.review.target.id}:${input.review.target.sourceKind}`,
      founderMaterial: input.review.consent.contentUse === 'allowed',
    },
    authority: {
      externalActionAuthorized: false,
      exactContent: null,
      destination: null,
      requiresExplicitApproval: true,
    },
    pathname: input.pathname?.slice(0, 512) ?? null,
    userAgent: input.userAgent?.slice(0, 1_000) ?? null,
    timestampIso: input.capturedAt,
  };
}

export function buildFounderReviewReceipt(input: {
  readonly id: string;
  readonly createdAt: Date | string;
  readonly context: StoredFounderReviewContext;
}): FounderReviewReceipt {
  const media = input.context.recording.media;
  const mediaAvailable = Boolean(media && !input.context.recording.deletedAt);
  return {
    schemaVersion: FOUNDER_REVIEW_SCHEMA_VERSION,
    id: input.id,
    sessionId: input.context.sessionId,
    segmentId: input.context.segmentId,
    target: input.context.target,
    decision: input.context.decision,
    transcript: input.context.transcript,
    typedText: input.context.typedText,
    transcription: input.context.transcription,
    recording: {
      startedAt: input.context.recording.startedAt,
      endedAt: input.context.recording.endedAt,
      initiatedBy: input.context.recording.initiatedBy,
      status: input.context.recording.status,
      retention: input.context.recording.retention,
      durationMs: input.context.recording.durationMs,
      byteSize: media?.byteSize ?? null,
      sha256: media?.sha256 ?? null,
      mediaAvailable,
      mediaPath: mediaAvailable ? founderReviewMediaPath(input.id) : null,
      deletedAt: input.context.recording.deletedAt,
    },
    consent: input.context.consent,
    rationaleExtractionStatus: input.context.rationaleExtractionStatus,
    provenance: input.context.provenance,
    authority: input.context.authority,
    createdAt:
      input.createdAt instanceof Date
        ? input.createdAt.toISOString()
        : input.createdAt,
  };
}
