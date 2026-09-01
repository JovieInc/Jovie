import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import {
  CreateFounderReviewSchema,
  founderReviewUserBlobPrefix,
} from '@/lib/founder-review/contract';
import { founderReviewErrorResponse } from '@/lib/founder-review/route-error';
import {
  createFounderReview,
  listFounderReviews,
  resolveFounderReviewUserId,
} from '@/lib/founder-review/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';

export const runtime = 'nodejs';
const MAX_REVIEW_BODY_BYTES = 64 * 1024;

export async function GET() {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const appUserId = await resolveFounderReviewUserId(userId);
    return NextResponse.json(
      {
        ok: true,
        receipts: await listFounderReviews({ userIdentity: appUserId }),
        uploadPathPrefix: founderReviewUserBlobPrefix(appUserId),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (caught) {
    return founderReviewErrorResponse(caught, '/api/inbox/founder-reviews');
  }
}

export async function POST(request: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const body = await parseJsonBody<unknown>(request, {
      route: '/api/inbox/founder-reviews',
      maxBodySize: MAX_REVIEW_BODY_BYTES,
    });
    if (!body.ok) return body.response;
    const parsed = CreateFounderReviewSchema.safeParse(body.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid-founder-review' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const receipt = await createFounderReview({
      userIdentity: userId,
      review: parsed.data,
      pathname: request.headers.get('x-jovie-pathname'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json(
      { ok: true, receipt },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (caught) {
    return founderReviewErrorResponse(caught, '/api/inbox/founder-reviews');
  }
}
