import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { CreateWorkflowCaptureRequestSchema } from '@/lib/workflow-capture/contract';
import { workflowCaptureErrorResponse } from '@/lib/workflow-capture/route-error';
import { createWorkflowCaptureRequest } from '@/lib/workflow-capture/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const parsed = CreateWorkflowCaptureRequestSchema.safeParse(
      await request.json()
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid-workflow-capture-request' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const receipt = await createWorkflowCaptureRequest({
      userId,
      request: parsed.data,
    });
    return NextResponse.json(
      { ok: true, receipt },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (caught) {
    return workflowCaptureErrorResponse(caught, '/api/workflow-captures');
  }
}
