import { get } from '@vercel/blob';
import { requireAuth } from '@/lib/auth/require-auth';
import { WorkflowCaptureExecutionResultSchema } from '@/lib/workflow-capture/contract';
import { workflowCaptureErrorResponse } from '@/lib/workflow-capture/route-error';
import {
  loadOwnedWorkflowCapture,
  WorkflowCaptureError,
} from '@/lib/workflow-capture/server';

export const runtime = 'nodejs';

interface RouteParams {
  readonly params: Promise<{ readonly id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  try {
    const capture = await loadOwnedWorkflowCapture(id, userId);
    const stored = WorkflowCaptureExecutionResultSchema.safeParse(
      capture.executionResult
    );
    if (!stored.success || stored.data.state === 'revoked') {
      throw new WorkflowCaptureError('capture-media-unavailable', 404);
    }
    if (Date.parse(capture.payload.expiresAt) <= Date.now()) {
      throw new WorkflowCaptureError('capture-request-expired', 410);
    }
    const range = request.headers.get('range');
    const blob = await get(stored.data.pathname, {
      access: 'private',
      useCache: false,
      ...(range ? { headers: { Range: range } } : {}),
    });
    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      throw new WorkflowCaptureError('capture-media-unavailable', 404);
    }
    return new Response(blob.stream, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline',
        'Content-Type': blob.blob.contentType,
        ETag: blob.blob.etag,
      },
    });
  } catch (caught) {
    return workflowCaptureErrorResponse(
      caught,
      '/api/workflow-captures/[id]/media'
    );
  }
}
