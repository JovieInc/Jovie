import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

const REASON_STATUS: Record<string, number> = {
  forbidden: 403,
  not_found: 404,
  not_pending: 409,
  not_needed: 409,
};

export function approvalFailureStatus(reason: string): number {
  return REASON_STATUS[reason] ?? 400;
}

export function handleApprovalsError(error: unknown, route: string) {
  captureError('Approvals API error', error, { route });
  if (error instanceof Error && error.message === 'Unauthorized') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500, headers: NO_STORE_HEADERS }
  );
}
