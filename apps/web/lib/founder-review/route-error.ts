import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { FounderReviewError } from './server';

export async function founderReviewErrorResponse(
  error: unknown,
  route: string
): Promise<NextResponse> {
  if (error instanceof FounderReviewError) {
    return NextResponse.json(
      { error: error.code },
      { status: error.status, headers: NO_STORE_HEADERS }
    );
  }
  await captureError('Founder review request failed', error, { route });
  return NextResponse.json(
    { error: 'founder-review-request-failed' },
    { status: 500, headers: NO_STORE_HEADERS }
  );
}
