import 'server-only';

import { createHash } from 'node:crypto';
import { del, get, head } from '@vercel/blob';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getUserByIdentity } from '@/lib/db/queries/shared';
import { suggestedActions } from '@/lib/db/schema/connectors';
import { feedbackItems } from '@/lib/db/schema/feedback';
import {
  buildFounderReviewReceipt,
  buildStoredFounderReviewContext,
  type CreateFounderReviewInput,
  CreateFounderReviewSchema,
  FOUNDER_REVIEW_AUDIO_TYPES,
  FOUNDER_REVIEW_MAX_AUDIO_BYTES,
  FOUNDER_REVIEW_SOURCE,
  type FounderReviewReceipt,
  type FounderReviewTarget,
  founderReviewBlobPrefix,
  StoredFounderReviewContextSchema,
} from './contract';

export class FounderReviewError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number
  ) {
    super(code);
    this.name = 'FounderReviewError';
  }
}

function deterministicReviewId(seed: string): string {
  const bytes = createHash('sha256').update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function deriveFounderReviewId(input: {
  readonly userId: string;
  readonly segmentId: string;
}): string {
  return deterministicReviewId(
    `founder-inbox-review:v1:${input.userId}:${input.segmentId}`
  );
}

export async function resolveFounderReviewUserId(
  userIdentity: string
): Promise<string> {
  const user = await getUserByIdentity(db, userIdentity);
  if (!user || user.deletedAt) {
    throw new FounderReviewError('founder-review-user-not-found', 404);
  }
  return user.id;
}

export async function assertFounderReviewTargetOwnership(input: {
  readonly userId: string;
  readonly target: FounderReviewTarget;
}): Promise<void> {
  if (input.target.type === 'founder-note') return;
  const [action] = await db
    .select({ kind: suggestedActions.kind })
    .from(suggestedActions)
    .where(
      and(
        eq(suggestedActions.id, input.target.id),
        eq(suggestedActions.userId, input.userId)
      )
    )
    .limit(1);
  if (!action || action.kind !== input.target.sourceKind) {
    throw new FounderReviewError('founder-review-target-not-found', 404);
  }
}

async function verifyRetainedMedia(input: {
  readonly userId: string;
  readonly review: CreateFounderReviewInput;
}): Promise<void> {
  const media = input.review.recording.media;
  if (!media) return;
  const prefix = founderReviewBlobPrefix({
    userId: input.userId,
    sessionId: input.review.sessionId,
    segmentId: input.review.segmentId,
    target: input.review.target,
  });
  if (!media.pathname.startsWith(prefix)) {
    throw new FounderReviewError('invalid-founder-review-media-path', 422);
  }
  const blob = await head(media.blobUrl);
  if (
    blob.pathname !== media.pathname ||
    blob.size !== media.byteSize ||
    blob.size > FOUNDER_REVIEW_MAX_AUDIO_BYTES ||
    blob.contentType !== media.contentType ||
    !FOUNDER_REVIEW_AUDIO_TYPES.includes(
      blob.contentType as (typeof FOUNDER_REVIEW_AUDIO_TYPES)[number]
    )
  ) {
    throw new FounderReviewError(
      'founder-review-media-verification-failed',
      422
    );
  }
}

export async function createFounderReview(input: {
  readonly userIdentity: string;
  readonly review: CreateFounderReviewInput;
  readonly pathname: string | null;
  readonly userAgent: string | null;
}): Promise<FounderReviewReceipt> {
  const review = CreateFounderReviewSchema.parse(input.review);
  const userId = await resolveFounderReviewUserId(input.userIdentity);
  await assertFounderReviewTargetOwnership({ userId, target: review.target });
  await verifyRetainedMedia({ userId, review });
  const id = deriveFounderReviewId({ userId, segmentId: review.segmentId });
  const capturedAt = new Date();
  const context = buildStoredFounderReviewContext({
    review,
    pathname: input.pathname,
    userAgent: input.userAgent,
    capturedAt: capturedAt.toISOString(),
  });
  const message =
    [review.transcript, review.typedText].filter(Boolean).join('\n\n') ||
    `${review.decision}: ${review.target.title}`;

  await db
    .insert(feedbackItems)
    .values({
      id,
      userId,
      message,
      source: FOUNDER_REVIEW_SOURCE,
      status: 'pending',
      context,
      createdAt: capturedAt,
      updatedAt: capturedAt,
    })
    .onConflictDoNothing();

  return loadOwnedFounderReview({ id, userIdentity: userId });
}

export async function loadOwnedFounderReview(input: {
  readonly id: string;
  readonly userIdentity: string;
}): Promise<FounderReviewReceipt> {
  const userId = await resolveFounderReviewUserId(input.userIdentity);
  const [row] = await db
    .select({
      id: feedbackItems.id,
      context: feedbackItems.context,
      createdAt: feedbackItems.createdAt,
    })
    .from(feedbackItems)
    .where(
      and(
        eq(feedbackItems.id, input.id),
        eq(feedbackItems.userId, userId),
        eq(feedbackItems.source, FOUNDER_REVIEW_SOURCE)
      )
    )
    .limit(1);
  const context = StoredFounderReviewContextSchema.safeParse(row?.context);
  if (!row || !context.success) {
    throw new FounderReviewError('founder-review-not-found', 404);
  }
  return buildFounderReviewReceipt({
    id: row.id,
    createdAt: row.createdAt,
    context: context.data,
  });
}

export async function listFounderReviews(input: {
  readonly userIdentity: string;
  readonly limit?: number;
}): Promise<FounderReviewReceipt[]> {
  const userId = await resolveFounderReviewUserId(input.userIdentity);
  const rows = await db
    .select({
      id: feedbackItems.id,
      context: feedbackItems.context,
      createdAt: feedbackItems.createdAt,
    })
    .from(feedbackItems)
    .where(
      and(
        eq(feedbackItems.userId, userId),
        eq(feedbackItems.source, FOUNDER_REVIEW_SOURCE)
      )
    )
    .orderBy(desc(feedbackItems.createdAt))
    .limit(Math.min(Math.max(input.limit ?? 12, 1), 50));

  return rows.flatMap(row => {
    const context = StoredFounderReviewContextSchema.safeParse(row.context);
    return context.success
      ? [
          buildFounderReviewReceipt({
            id: row.id,
            createdAt: row.createdAt,
            context: context.data,
          }),
        ]
      : [];
  });
}

export async function getFounderReviewMedia(input: {
  readonly id: string;
  readonly userIdentity: string;
  readonly range: string | null;
}) {
  const receipt = await loadOwnedFounderReview(input);
  if (!receipt.recording.mediaAvailable || !receipt.recording.mediaPath) {
    throw new FounderReviewError('founder-review-media-unavailable', 404);
  }
  const stored = await loadStoredContext(input);
  const pathname = stored.context.recording.media?.pathname;
  if (!pathname) {
    throw new FounderReviewError('founder-review-media-unavailable', 404);
  }
  const blob = await get(pathname, {
    access: 'private',
    useCache: false,
    ...(input.range ? { headers: { Range: input.range } } : {}),
  });
  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    throw new FounderReviewError('founder-review-media-unavailable', 404);
  }
  return blob;
}

async function loadStoredContext(input: {
  readonly id: string;
  readonly userIdentity: string;
}) {
  const userId = await resolveFounderReviewUserId(input.userIdentity);
  const [row] = await db
    .select({ context: feedbackItems.context })
    .from(feedbackItems)
    .where(
      and(
        eq(feedbackItems.id, input.id),
        eq(feedbackItems.userId, userId),
        eq(feedbackItems.source, FOUNDER_REVIEW_SOURCE)
      )
    )
    .limit(1);
  const context = StoredFounderReviewContextSchema.safeParse(row?.context);
  if (!context.success) {
    throw new FounderReviewError('founder-review-not-found', 404);
  }
  return { userId, context: context.data };
}

export async function deleteFounderReviewMedia(input: {
  readonly id: string;
  readonly userIdentity: string;
}): Promise<FounderReviewReceipt> {
  const stored = await loadStoredContext(input);
  const media = stored.context.recording.media;
  if (!media || stored.context.recording.deletedAt) {
    return loadOwnedFounderReview(input);
  }
  const deletedAt = new Date();
  const context = {
    ...stored.context,
    recording: {
      ...stored.context.recording,
      deletedAt: deletedAt.toISOString(),
    },
  };
  try {
    await del(media.blobUrl);
  } catch {
    throw new FounderReviewError('founder-review-media-deletion-failed', 502);
  }
  const updated = await db
    .update(feedbackItems)
    .set({ context, updatedAt: deletedAt })
    .where(
      and(
        eq(feedbackItems.id, input.id),
        eq(feedbackItems.userId, stored.userId),
        eq(feedbackItems.source, FOUNDER_REVIEW_SOURCE)
      )
    )
    .returning({ id: feedbackItems.id });
  if (!updated[0]) {
    throw new FounderReviewError('founder-review-update-conflict', 409);
  }
  return loadOwnedFounderReview(input);
}
