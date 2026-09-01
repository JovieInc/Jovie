import 'server-only';

import { createHash } from 'node:crypto';
import { del, get } from '@vercel/blob';
import { and, desc, sql as drizzleSql, eq, inArray, lt } from 'drizzle-orm';
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
  FOUNDER_REVIEW_UPLOAD_LEASE_SOURCE,
  FOUNDER_REVIEW_UPLOAD_LEASE_TTL_MS,
  type FounderReviewReceipt,
  type FounderReviewTarget,
  FounderReviewUploadTokenPayloadSchema,
  founderReviewBlobPrefix,
  type StoredFounderReviewContext,
  StoredFounderReviewContextSchema,
  StoredFounderReviewUploadLeaseSchema,
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

export function deriveFounderReviewUploadLeaseId(input: {
  readonly userId: string;
  readonly segmentId: string;
  readonly pathname: string;
}): string {
  return deterministicReviewId(
    `founder-inbox-review-upload-lease:v1:${input.userId}:${input.segmentId}:${input.pathname}`
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
  const blob = await get(media.pathname, {
    access: 'private',
    useCache: false,
  });
  if (
    !blob ||
    blob.statusCode !== 200 ||
    !blob.stream ||
    blob.blob.pathname !== media.pathname ||
    blob.blob.url !== media.blobUrl ||
    blob.blob.size !== media.byteSize ||
    blob.blob.size > FOUNDER_REVIEW_MAX_AUDIO_BYTES ||
    blob.blob.contentType !== media.contentType ||
    !FOUNDER_REVIEW_AUDIO_TYPES.includes(
      blob.blob.contentType as (typeof FOUNDER_REVIEW_AUDIO_TYPES)[number]
    )
  ) {
    throw new FounderReviewError(
      'founder-review-media-verification-failed',
      422
    );
  }
  const hash = createHash('sha256');
  const reader = blob.stream.getReader();
  let byteSize = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    byteSize += chunk.value.byteLength;
    hash.update(chunk.value);
  }
  if (byteSize !== media.byteSize || hash.digest('hex') !== media.sha256) {
    throw new FounderReviewError('founder-review-media-integrity-failed', 422);
  }
}

export async function recordFounderReviewUploadLease(input: {
  readonly tokenPayload?: string | null;
  readonly blob: {
    readonly url: string;
    readonly pathname: string;
    readonly contentType: string;
  };
}): Promise<void> {
  let tokenValue: unknown;
  try {
    tokenValue = JSON.parse(input.tokenPayload ?? 'null');
  } catch {
    throw new FounderReviewError('invalid-founder-review-upload-payload', 422);
  }
  const token = FounderReviewUploadTokenPayloadSchema.parse(tokenValue);
  const prefix = founderReviewBlobPrefix({
    userId: token.userId,
    sessionId: token.sessionId,
    segmentId: token.segmentId,
    target: {
      type: token.targetType,
      id: token.targetId,
      sourceKind: token.sourceKind,
    },
  });
  if (
    !input.blob.pathname.startsWith(prefix) ||
    !FOUNDER_REVIEW_AUDIO_TYPES.includes(
      input.blob.contentType as (typeof FOUNDER_REVIEW_AUDIO_TYPES)[number]
    )
  ) {
    throw new FounderReviewError('invalid-founder-review-media-path', 422);
  }
  const id = deriveFounderReviewUploadLeaseId({
    ...token,
    pathname: input.blob.pathname,
  });
  const uploadedAt = new Date();
  await db
    .insert(feedbackItems)
    .values({
      id,
      userId: token.userId,
      message: 'Retained founder-review audio pending receipt',
      source: FOUNDER_REVIEW_UPLOAD_LEASE_SOURCE,
      status: 'pending',
      context: {
        schemaVersion: 1,
        kind: 'founder-review-upload-lease',
        reviewId: deriveFounderReviewId(token),
        token,
        blob: input.blob,
        uploadedAt: uploadedAt.toISOString(),
      },
      createdAt: uploadedAt,
      updatedAt: uploadedAt,
    })
    .onConflictDoNothing();
  try {
    await resolveFounderReviewUserId(token.userId);
  } catch (caught) {
    try {
      await del(input.blob.url);
    } catch {
      throw new FounderReviewError('founder-review-media-deletion-failed', 502);
    }
    await db
      .delete(feedbackItems)
      .where(
        and(
          eq(feedbackItems.id, id),
          eq(feedbackItems.userId, token.userId),
          eq(feedbackItems.source, FOUNDER_REVIEW_UPLOAD_LEASE_SOURCE)
        )
      );
    throw caught;
  }
}

function storedReviewMatchesInput(
  stored: StoredFounderReviewContext,
  review: CreateFounderReviewInput
): boolean {
  const { deletedAt: _deletedAt, ...storedRecording } = stored.recording;
  return (
    stored.sessionId === review.sessionId &&
    stored.segmentId === review.segmentId &&
    JSON.stringify(stored.target) === JSON.stringify(review.target) &&
    stored.decision === review.decision &&
    stored.transcript === review.transcript &&
    stored.typedText === review.typedText &&
    JSON.stringify(stored.transcription) ===
      JSON.stringify(review.transcription) &&
    JSON.stringify(storedRecording) === JSON.stringify(review.recording) &&
    JSON.stringify(stored.consent) === JSON.stringify(review.consent)
  );
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

  const stored = await loadStoredContext({ id, userIdentity: userId });
  if (!storedReviewMatchesInput(stored.context, review)) {
    throw new FounderReviewError('founder-review-idempotency-conflict', 409);
  }
  if (review.recording.media) {
    await db.delete(feedbackItems).where(
      and(
        eq(
          feedbackItems.id,
          deriveFounderReviewUploadLeaseId({
            userId,
            segmentId: review.segmentId,
            pathname: review.recording.media.pathname,
          })
        ),
        eq(feedbackItems.userId, userId),
        eq(feedbackItems.source, FOUNDER_REVIEW_UPLOAD_LEASE_SOURCE)
      )
    );
  }
  return loadOwnedFounderReview({ id, userIdentity: userId });
}

export async function updateFounderReviewActionOutcome(input: {
  readonly id: string;
  readonly userIdentity: string;
  readonly status: 'applied' | 'failed';
  readonly errorCode: string | null;
}): Promise<FounderReviewReceipt> {
  const stored = await loadStoredContext(input);
  if (
    stored.context.actionOutcome.status === 'not-applicable' ||
    (stored.context.actionOutcome.status === 'applied' &&
      input.status === 'failed')
  ) {
    return loadOwnedFounderReview(input);
  }
  if (input.status === 'applied') {
    const expectedStatus =
      stored.context.decision === 'rejected' ? 'rejected' : 'approved';
    const [action] = await db
      .select({ status: suggestedActions.status })
      .from(suggestedActions)
      .where(
        and(
          eq(suggestedActions.id, stored.context.target.id),
          eq(suggestedActions.userId, stored.userId)
        )
      )
      .limit(1);
    const canonicalApplied =
      expectedStatus === 'approved'
        ? action?.status === 'approved' || action?.status === 'executed'
        : action?.status === 'rejected';
    if (!canonicalApplied) {
      throw new FounderReviewError('canonical-action-not-applied', 409);
    }
  }
  const updatedAt = new Date();
  const actionOutcome = {
    status: input.status,
    updatedAt: updatedAt.toISOString(),
    errorCode: input.status === 'failed' ? input.errorCode : null,
  };
  const updated = await db
    .update(feedbackItems)
    .set({
      context: drizzleSql`jsonb_set(${feedbackItems.context}, '{actionOutcome}', ${JSON.stringify(actionOutcome)}::jsonb, true)`,
      updatedAt,
    })
    .where(
      and(
        eq(feedbackItems.id, input.id),
        eq(feedbackItems.userId, stored.userId),
        eq(feedbackItems.source, FOUNDER_REVIEW_SOURCE),
        ...(input.status === 'failed'
          ? [
              drizzleSql`${feedbackItems.context}->'actionOutcome'->>'status' IS DISTINCT FROM 'applied'`,
            ]
          : [])
      )
    )
    .returning({ id: feedbackItems.id });
  if (!updated[0]) {
    return loadOwnedFounderReview(input);
  }
  return loadOwnedFounderReview(input);
}

export async function cleanupFounderReviewUploadLeases(input?: {
  readonly now?: Date;
  readonly limit?: number;
}) {
  const cutoff = new Date(
    (input?.now ?? new Date()).getTime() - FOUNDER_REVIEW_UPLOAD_LEASE_TTL_MS
  );
  const rows = await db
    .select({
      id: feedbackItems.id,
      context: feedbackItems.context,
    })
    .from(feedbackItems)
    .where(
      and(
        eq(feedbackItems.source, FOUNDER_REVIEW_UPLOAD_LEASE_SOURCE),
        eq(feedbackItems.status, 'pending'),
        lt(feedbackItems.createdAt, cutoff)
      )
    )
    .limit(Math.min(Math.max(input?.limit ?? 100, 1), 500));
  const leases = rows.flatMap(row => {
    const parsed = StoredFounderReviewUploadLeaseSchema.safeParse(row.context);
    return parsed.success ? [{ id: row.id, lease: parsed.data }] : [];
  });
  const reviewIds = leases.map(item => item.lease.reviewId);
  const boundRows =
    reviewIds.length > 0
      ? await db
          .select({ id: feedbackItems.id, context: feedbackItems.context })
          .from(feedbackItems)
          .where(
            and(
              eq(feedbackItems.source, FOUNDER_REVIEW_SOURCE),
              inArray(feedbackItems.id, reviewIds)
            )
          )
      : [];
  const boundMedia = new Map(
    boundRows.flatMap(row => {
      const parsed = StoredFounderReviewContextSchema.safeParse(row.context);
      return parsed.success && parsed.data.recording.media
        ? [[row.id, parsed.data.recording.media] as const]
        : [];
    })
  );
  const deleteLeaseIds: string[] = [];
  const quarantineLeaseIds: string[] = rows
    .filter(
      row =>
        !StoredFounderReviewUploadLeaseSchema.safeParse(row.context).success
    )
    .map(row => row.id);
  let deletedOrphans = 0;
  let reconciled = 0;
  let failed = rows.length - leases.length;
  for (const item of leases) {
    const media = boundMedia.get(item.lease.reviewId);
    if (
      media?.blobUrl === item.lease.blob.url &&
      media.pathname === item.lease.blob.pathname &&
      media.contentType === item.lease.blob.contentType
    ) {
      reconciled += 1;
      deleteLeaseIds.push(item.id);
      continue;
    }
    try {
      await del(item.lease.blob.url);
      deletedOrphans += 1;
      deleteLeaseIds.push(item.id);
    } catch {
      failed += 1;
      quarantineLeaseIds.push(item.id);
    }
  }
  if (quarantineLeaseIds.length > 0) {
    await db
      .update(feedbackItems)
      .set({
        status: 'dismissed',
        message: 'Founder-review upload lease requires manual cleanup',
        updatedAt: input?.now ?? new Date(),
      })
      .where(
        and(
          eq(feedbackItems.source, FOUNDER_REVIEW_UPLOAD_LEASE_SOURCE),
          inArray(feedbackItems.id, quarantineLeaseIds)
        )
      );
  }
  if (deleteLeaseIds.length > 0) {
    await db
      .delete(feedbackItems)
      .where(
        and(
          eq(feedbackItems.source, FOUNDER_REVIEW_UPLOAD_LEASE_SOURCE),
          inArray(feedbackItems.id, deleteLeaseIds)
        )
      );
  }
  return { scanned: rows.length, deletedOrphans, reconciled, failed };
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

  const storedRows = rows.flatMap(row => {
    const context = StoredFounderReviewContextSchema.safeParse(row.context);
    return context.success
      ? [{ id: row.id, createdAt: row.createdAt, context: context.data }]
      : [];
  });
  const candidates = storedRows.filter(
    row =>
      row.context.target.type === 'inbox-card' &&
      (row.context.decision === 'approved' ||
        row.context.decision === 'rejected') &&
      (row.context.actionOutcome.status === 'pending' ||
        row.context.actionOutcome.status === 'failed')
  );
  const actionIds = candidates.map(row => row.context.target.id);
  const actions =
    actionIds.length > 0
      ? await db
          .select({ id: suggestedActions.id, status: suggestedActions.status })
          .from(suggestedActions)
          .where(
            and(
              eq(suggestedActions.userId, userId),
              inArray(suggestedActions.id, actionIds)
            )
          )
      : [];
  const actionStatuses = new Map(
    actions.map(action => [action.id, action.status])
  );
  const reconciledAt = new Date();
  const reconciledIso = reconciledAt.toISOString();
  for (const row of candidates) {
    const status = actionStatuses.get(row.context.target.id);
    const canonicalApplied =
      row.context.decision === 'rejected'
        ? status === 'rejected'
        : status === 'approved' || status === 'executed';
    if (!canonicalApplied) continue;
    const actionOutcome = {
      status: 'applied' as const,
      updatedAt: reconciledIso,
      errorCode: null,
    };
    await db
      .update(feedbackItems)
      .set({
        context: drizzleSql`jsonb_set(${feedbackItems.context}, '{actionOutcome}', ${JSON.stringify(actionOutcome)}::jsonb, true)`,
        updatedAt: reconciledAt,
      })
      .where(
        and(
          eq(feedbackItems.id, row.id),
          eq(feedbackItems.userId, userId),
          eq(feedbackItems.source, FOUNDER_REVIEW_SOURCE),
          drizzleSql`${feedbackItems.context}->'actionOutcome'->>'status' IN ('pending', 'failed')`
        )
      );
    row.context.actionOutcome = actionOutcome;
  }

  return storedRows.map(row =>
    buildFounderReviewReceipt({
      id: row.id,
      createdAt: row.createdAt,
      context: row.context,
    })
  );
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
  try {
    await del(media.blobUrl);
  } catch {
    throw new FounderReviewError('founder-review-media-deletion-failed', 502);
  }
  const updated = await db
    .update(feedbackItems)
    .set({
      context: drizzleSql`jsonb_set(${feedbackItems.context}, '{recording,deletedAt}', ${JSON.stringify(deletedAt.toISOString())}::jsonb, true)`,
      updatedAt: deletedAt,
    })
    .where(
      and(
        eq(feedbackItems.id, input.id),
        eq(feedbackItems.userId, stored.userId),
        eq(feedbackItems.source, FOUNDER_REVIEW_SOURCE),
        drizzleSql`${feedbackItems.context}->'recording'->>'deletedAt' IS NULL`
      )
    )
    .returning({ id: feedbackItems.id });
  if (!updated[0]) {
    throw new FounderReviewError('founder-review-update-conflict', 409);
  }
  return loadOwnedFounderReview(input);
}
