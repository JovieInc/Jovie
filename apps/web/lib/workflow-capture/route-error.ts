import 'server-only';

import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { logger } from '@/lib/utils/logger';
import { WorkflowCaptureError } from './server';

export async function workflowCaptureErrorResponse(
  error: unknown,
  route: string
): Promise<NextResponse> {
  if (error instanceof WorkflowCaptureError) {
    return NextResponse.json(
      { error: error.code },
      { status: error.status, headers: NO_STORE_HEADERS }
    );
  }
  logger.error('[workflow-capture] request failed', { route, error });
  await captureError('Workflow capture request failed', error, { route });
  return NextResponse.json(
    { error: 'internal-error' },
    { status: 500, headers: NO_STORE_HEADERS }
  );
}
