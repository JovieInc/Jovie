import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  WORKFLOW_CAPTURE_ALLOWED_CONTENT_TYPES,
  WORKFLOW_CAPTURE_MAX_BYTES,
  workflowCaptureBlobPrefix,
} from '@/lib/workflow-capture/contract';
import { workflowCaptureErrorResponse } from '@/lib/workflow-capture/route-error';
import {
  loadOwnedWorkflowCapture,
  WorkflowCaptureError,
} from '@/lib/workflow-capture/server';

export const runtime = 'nodejs';

interface RouteParams {
  readonly params: Promise<{ readonly id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async pathname => {
        const capture = await loadOwnedWorkflowCapture(id, userId);
        if (
          capture.status !== 'pending' ||
          capture.executionResult !== null ||
          Date.parse(capture.payload.expiresAt) <= Date.now()
        ) {
          throw new WorkflowCaptureError('capture-request-unavailable', 410);
        }
        if (!pathname.startsWith(workflowCaptureBlobPrefix(userId, id))) {
          throw new WorkflowCaptureError('invalid-capture-path', 422);
        }
        return {
          allowedContentTypes: [...WORKFLOW_CAPTURE_ALLOWED_CONTENT_TYPES],
          maximumSizeInBytes: WORKFLOW_CAPTURE_MAX_BYTES,
          tokenPayload: JSON.stringify({ captureId: id, userId }),
        };
      },
      onUploadCompleted: async () => {
        // Client confirm attaches the verified hash and duration.
      },
    });
    return NextResponse.json(response, { headers: NO_STORE_HEADERS });
  } catch (caught) {
    return workflowCaptureErrorResponse(
      caught,
      '/api/workflow-captures/[id]/upload-token'
    );
  }
}
