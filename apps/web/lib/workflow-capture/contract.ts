import { z } from 'zod';
import { WORKFLOW_CAPTURE_REQUEST_KIND } from '@/lib/connectors/suggested-action-kinds';

export { WORKFLOW_CAPTURE_REQUEST_KIND };

export const WORKFLOW_CAPTURE_SCHEMA_VERSION = 1 as const;
export const WORKFLOW_CAPTURE_MAX_BYTES = 250 * 1024 * 1024;
export const WORKFLOW_CAPTURE_ALLOWED_CONTENT_TYPES = [
  'video/webm',
  'video/mp4',
  'video/quicktime',
] as const;

const HttpsUrlSchema = z
  .string()
  .url()
  .refine(value => new URL(value).protocol === 'https:', 'HTTPS required');

export const CreateWorkflowCaptureRequestSchema = z.object({
  requestingTaskId: z.string().trim().min(1).max(200),
  requestKey: z.string().trim().min(1).max(128).default('default'),
  title: z.string().trim().min(1).max(160),
  instructions: z.string().trim().min(1).max(2_000),
  startUrl: HttpsUrlSchema.optional(),
  requestedBy: z.enum(['jovie_agent', 'creator']).default('jovie_agent'),
  expiresInHours: z.number().int().min(1).max(720).default(168),
});

export type CreateWorkflowCaptureRequestInput = z.input<
  typeof CreateWorkflowCaptureRequestSchema
>;

export const WorkflowCaptureRequestPayloadSchema = z.object({
  schemaVersion: z.literal(WORKFLOW_CAPTURE_SCHEMA_VERSION),
  requestingTaskId: z.string().min(1),
  requestKey: z.string().min(1),
  title: z.string().min(1),
  instructions: z.string().min(1),
  startUrl: HttpsUrlSchema.optional(),
  requestedBy: z.enum(['jovie_agent', 'creator']),
  requestedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  redactionPolicy: z.literal('manual-review-required'),
});

export type WorkflowCaptureRequestPayload = z.infer<
  typeof WorkflowCaptureRequestPayloadSchema
>;

const StoredCaptureSchema = z.object({
  blobUrl: HttpsUrlSchema,
  pathname: z.string().min(1),
  contentType: z.enum(WORKFLOW_CAPTURE_ALLOWED_CONTENT_TYPES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().positive().max(WORKFLOW_CAPTURE_MAX_BYTES),
  durationMs: z.number().int().positive(),
  uploadedAt: z.string().datetime({ offset: true }),
});

export const WorkflowCaptureExecutionResultSchema = z.discriminatedUnion(
  'state',
  [
    StoredCaptureSchema.extend({
      schemaVersion: z.literal(WORKFLOW_CAPTURE_SCHEMA_VERSION),
      state: z.literal('uploaded_needs_review'),
    }),
    StoredCaptureSchema.extend({
      schemaVersion: z.literal(WORKFLOW_CAPTURE_SCHEMA_VERSION),
      state: z.literal('ready'),
      readyAt: z.string().datetime({ offset: true }),
    }),
    z.object({
      schemaVersion: z.literal(WORKFLOW_CAPTURE_SCHEMA_VERSION),
      state: z.literal('revoked'),
      sha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .nullable(),
      byteSize: z.number().int().positive().nullable(),
      durationMs: z.number().int().positive().nullable(),
      uploadedAt: z.string().datetime({ offset: true }).nullable(),
      revokedAt: z.string().datetime({ offset: true }),
    }),
  ]
);

export type WorkflowCaptureExecutionResult = z.infer<
  typeof WorkflowCaptureExecutionResultSchema
>;

export const ConfirmWorkflowCaptureUploadSchema = z.object({
  action: z.literal('confirm-upload'),
  blobUrl: HttpsUrlSchema,
  pathname: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().positive().max(WORKFLOW_CAPTURE_MAX_BYTES),
  durationMs: z.number().int().positive(),
});

export const WorkflowCaptureMutationSchema = z.discriminatedUnion('action', [
  ConfirmWorkflowCaptureUploadSchema,
  z.object({ action: z.literal('mark-ready') }),
  z.object({ action: z.literal('revoke') }),
]);

export type WorkflowCaptureMutation = z.infer<
  typeof WorkflowCaptureMutationSchema
>;

export interface WorkflowCaptureReceipt {
  readonly schemaVersion: typeof WORKFLOW_CAPTURE_SCHEMA_VERSION;
  readonly captureId: string;
  readonly requestingTaskId: string;
  readonly state: 'pending' | 'uploaded_needs_review' | 'ready' | 'revoked';
  readonly expiresAt: string;
  readonly sha256: string | null;
  readonly byteSize: number | null;
  readonly durationMs: number | null;
  readonly uploadedAt: string | null;
  readonly readyAt: string | null;
  readonly revokedAt: string | null;
}

export function buildWorkflowCaptureReceipt(input: {
  readonly captureId: string;
  readonly payload: WorkflowCaptureRequestPayload;
  readonly executionResult: unknown;
}): WorkflowCaptureReceipt {
  const result =
    input.executionResult === null || input.executionResult === undefined
      ? null
      : WorkflowCaptureExecutionResultSchema.parse(input.executionResult);
  return {
    schemaVersion: WORKFLOW_CAPTURE_SCHEMA_VERSION,
    captureId: input.captureId,
    requestingTaskId: input.payload.requestingTaskId,
    state: result?.state ?? 'pending',
    expiresAt: input.payload.expiresAt,
    sha256: result?.sha256 ?? null,
    byteSize: result?.byteSize ?? null,
    durationMs: result?.durationMs ?? null,
    uploadedAt: result?.uploadedAt ?? null,
    readyAt: result?.state === 'ready' ? result.readyAt : null,
    revokedAt: result?.state === 'revoked' ? result.revokedAt : null,
  };
}

export function workflowCaptureBlobPrefix(
  userId: string,
  captureId: string
): string {
  return `workflow-captures/${userId}/${captureId}/`;
}
