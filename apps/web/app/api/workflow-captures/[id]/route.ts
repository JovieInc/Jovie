import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  WorkflowCaptureMutationSchema,
  workflowCaptureBlobPrefix,
} from '@/lib/workflow-capture/contract';
import { workflowCaptureErrorResponse } from '@/lib/workflow-capture/route-error';
import {
  getWorkflowCaptureReceipt,
  mutateWorkflowCapture,
} from '@/lib/workflow-capture/server';

export const runtime = 'nodejs';

interface RouteParams {
  readonly params: Promise<{ readonly id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  try {
    const receipt = await getWorkflowCaptureReceipt(id, userId);
    return NextResponse.json(
      {
        ok: true,
        receipt,
        uploadPathPrefix: workflowCaptureBlobPrefix(userId, id),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (caught) {
    return workflowCaptureErrorResponse(caught, '/api/workflow-captures/[id]');
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  try {
    const parsed = WorkflowCaptureMutationSchema.safeParse(
      await request.json()
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid-workflow-capture-mutation' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const receipt = await mutateWorkflowCapture({
      captureId: id,
      userId,
      mutation: parsed.data,
    });
    return NextResponse.json(
      { ok: true, receipt },
      { headers: NO_STORE_HEADERS }
    );
  } catch (caught) {
    return workflowCaptureErrorResponse(caught, '/api/workflow-captures/[id]');
  }
}
