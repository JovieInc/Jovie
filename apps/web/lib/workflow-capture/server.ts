import 'server-only';

import { createHash } from 'node:crypto';
import { del, head } from '@vercel/blob';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type SuggestedAction,
  suggestedActions,
} from '@/lib/db/schema/connectors';
import { logger } from '@/lib/utils/logger';
import {
  buildWorkflowCaptureReceipt,
  type CreateWorkflowCaptureRequestInput,
  CreateWorkflowCaptureRequestSchema,
  WORKFLOW_CAPTURE_ALLOWED_CONTENT_TYPES,
  WORKFLOW_CAPTURE_MAX_BYTES,
  WORKFLOW_CAPTURE_REQUEST_KIND,
  WORKFLOW_CAPTURE_SCHEMA_VERSION,
  type WorkflowCaptureExecutionResult,
  WorkflowCaptureExecutionResultSchema,
  type WorkflowCaptureMutation,
  type WorkflowCaptureReceipt,
  type WorkflowCaptureRequestPayload,
  WorkflowCaptureRequestPayloadSchema,
  workflowCaptureBlobPrefix,
} from './contract';

export class WorkflowCaptureError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number
  ) {
    super(code);
    this.name = 'WorkflowCaptureError';
  }
}

function deterministicCaptureId(seed: string): string {
  const bytes = createHash('sha256').update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function deriveWorkflowCaptureId(input: {
  readonly userId: string;
  readonly requestingTaskId: string;
  readonly requestKey: string;
}): string {
  return deterministicCaptureId(
    `workflow-capture:v1:${input.userId}:${input.requestingTaskId}:${input.requestKey}`
  );
}

export async function createWorkflowCaptureRequest(input: {
  readonly userId: string;
  readonly request: CreateWorkflowCaptureRequestInput;
}): Promise<WorkflowCaptureReceipt> {
  const request = CreateWorkflowCaptureRequestSchema.parse(input.request);
  const captureId = deriveWorkflowCaptureId({
    userId: input.userId,
    requestingTaskId: request.requestingTaskId,
    requestKey: request.requestKey,
  });
  const requestedAt = new Date();
  const payload: WorkflowCaptureRequestPayload = {
    schemaVersion: WORKFLOW_CAPTURE_SCHEMA_VERSION,
    requestingTaskId: request.requestingTaskId,
    requestKey: request.requestKey,
    title: request.title,
    instructions: request.instructions,
    ...(request.startUrl ? { startUrl: request.startUrl } : {}),
    requestedBy: request.requestedBy,
    requestedAt: requestedAt.toISOString(),
    expiresAt: new Date(
      requestedAt.getTime() + request.expiresInHours * 60 * 60 * 1_000
    ).toISOString(),
    redactionPolicy: 'manual-review-required',
  };

  await db
    .insert(suggestedActions)
    .values({
      id: captureId,
      userId: input.userId,
      kind: WORKFLOW_CAPTURE_REQUEST_KIND,
      payload,
      signalType: 'other',
      status: 'pending',
      sourceRefs: [{ requestingTaskId: request.requestingTaskId }],
      rationale: request.instructions,
      idempotencyKey: captureId,
      sideEffects: [],
    })
    .onConflictDoNothing();

  const capture = await loadOwnedWorkflowCapture(captureId, input.userId);
  return buildWorkflowCaptureReceipt(capture);
}

export async function loadOwnedWorkflowCapture(
  captureId: string,
  userId: string
): Promise<{
  readonly captureId: string;
  readonly payload: WorkflowCaptureRequestPayload;
  readonly executionResult: unknown;
  readonly status: SuggestedAction['status'];
}> {
  const [row] = await db
    .select({
      id: suggestedActions.id,
      kind: suggestedActions.kind,
      payload: suggestedActions.payload,
      executionResult: suggestedActions.executionResult,
      status: suggestedActions.status,
    })
    .from(suggestedActions)
    .where(
      and(
        eq(suggestedActions.id, captureId),
        eq(suggestedActions.userId, userId)
      )
    )
    .limit(1);
  const payload = WorkflowCaptureRequestPayloadSchema.safeParse(row?.payload);
  if (!row || row.kind !== WORKFLOW_CAPTURE_REQUEST_KIND || !payload.success) {
    throw new WorkflowCaptureError('not-found', 404);
  }
  return {
    captureId: row.id,
    payload: payload.data,
    executionResult: row.executionResult,
    status: row.status,
  };
}

function assertNotExpired(payload: WorkflowCaptureRequestPayload): void {
  if (Date.parse(payload.expiresAt) <= Date.now()) {
    throw new WorkflowCaptureError('capture-request-expired', 410);
  }
}

async function confirmUpload(input: {
  readonly captureId: string;
  readonly userId: string;
  readonly capture: Awaited<ReturnType<typeof loadOwnedWorkflowCapture>>;
  readonly mutation: Extract<
    WorkflowCaptureMutation,
    { action: 'confirm-upload' }
  >;
}): Promise<void> {
  assertNotExpired(input.capture.payload);
  if (input.capture.status !== 'pending') {
    throw new WorkflowCaptureError('capture-already-decided', 409);
  }
  if (
    input.capture.executionResult !== null &&
    input.capture.executionResult !== undefined
  ) {
    throw new WorkflowCaptureError('capture-already-uploaded', 409);
  }
  const prefix = workflowCaptureBlobPrefix(input.userId, input.captureId);
  if (!input.mutation.pathname.startsWith(prefix)) {
    throw new WorkflowCaptureError('invalid-capture-path', 422);
  }
  const blob = await head(input.mutation.blobUrl);
  if (
    blob.pathname !== input.mutation.pathname ||
    blob.size !== input.mutation.byteSize ||
    blob.size > WORKFLOW_CAPTURE_MAX_BYTES ||
    !WORKFLOW_CAPTURE_ALLOWED_CONTENT_TYPES.includes(
      blob.contentType as (typeof WORKFLOW_CAPTURE_ALLOWED_CONTENT_TYPES)[number]
    )
  ) {
    throw new WorkflowCaptureError('capture-verification-failed', 422);
  }
  const result: WorkflowCaptureExecutionResult = {
    schemaVersion: WORKFLOW_CAPTURE_SCHEMA_VERSION,
    state: 'uploaded_needs_review',
    blobUrl: blob.url,
    pathname: blob.pathname,
    contentType:
      blob.contentType as (typeof WORKFLOW_CAPTURE_ALLOWED_CONTENT_TYPES)[number],
    sha256: input.mutation.sha256,
    byteSize: blob.size,
    durationMs: input.mutation.durationMs,
    uploadedAt: new Date().toISOString(),
  };
  await updateCapture(
    input.captureId,
    input.userId,
    'pending',
    'pending',
    result
  );
}

async function updateCapture(
  captureId: string,
  userId: string,
  expectedStatus: SuggestedAction['status'],
  status: 'pending' | 'executed' | 'expired',
  executionResult: WorkflowCaptureExecutionResult
): Promise<void> {
  const updated = await db
    .update(suggestedActions)
    .set({
      status,
      executionResult,
      ...(status === 'executed' ? { executedAt: new Date() } : {}),
    })
    .where(
      and(
        eq(suggestedActions.id, captureId),
        eq(suggestedActions.userId, userId),
        eq(suggestedActions.status, expectedStatus)
      )
    )
    .returning({ id: suggestedActions.id });
  if (updated.length === 0) {
    throw new WorkflowCaptureError('capture-update-conflict', 409);
  }
}

export async function mutateWorkflowCapture(input: {
  readonly captureId: string;
  readonly userId: string;
  readonly mutation: WorkflowCaptureMutation;
}): Promise<WorkflowCaptureReceipt> {
  const capture = await loadOwnedWorkflowCapture(input.captureId, input.userId);
  if (input.mutation.action === 'confirm-upload') {
    await confirmUpload({ ...input, capture, mutation: input.mutation });
  } else {
    const stored = WorkflowCaptureExecutionResultSchema.safeParse(
      capture.executionResult
    );
    if (input.mutation.action === 'mark-ready') {
      assertNotExpired(capture.payload);
      if (!stored.success || stored.data.state !== 'uploaded_needs_review') {
        throw new WorkflowCaptureError('capture-review-required', 409);
      }
      await updateCapture(
        input.captureId,
        input.userId,
        'pending',
        'executed',
        {
          ...stored.data,
          state: 'ready',
          readyAt: new Date().toISOString(),
        }
      );
    } else if (!stored.success || stored.data.state !== 'revoked') {
      const blobUrl =
        stored.success && stored.data.state !== 'revoked'
          ? stored.data.blobUrl
          : null;
      await updateCapture(
        input.captureId,
        input.userId,
        capture.status,
        'expired',
        {
          schemaVersion: WORKFLOW_CAPTURE_SCHEMA_VERSION,
          state: 'revoked',
          sha256: stored.success ? stored.data.sha256 : null,
          byteSize: stored.success ? stored.data.byteSize : null,
          durationMs: stored.success ? stored.data.durationMs : null,
          uploadedAt: stored.success ? stored.data.uploadedAt : null,
          revokedAt: new Date().toISOString(),
        }
      );
      if (blobUrl) {
        try {
          await del(blobUrl);
        } catch (error) {
          logger.error('[workflow-capture] revoked blob deletion failed', {
            captureId: input.captureId,
            error,
          });
        }
      }
    }
  }
  const updated = await loadOwnedWorkflowCapture(input.captureId, input.userId);
  return buildWorkflowCaptureReceipt(updated);
}

export async function getWorkflowCaptureReceipt(
  captureId: string,
  userId: string
): Promise<WorkflowCaptureReceipt> {
  return buildWorkflowCaptureReceipt(
    await loadOwnedWorkflowCapture(captureId, userId)
  );
}
