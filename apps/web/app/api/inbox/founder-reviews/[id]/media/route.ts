import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { founderReviewErrorResponse } from '@/lib/founder-review/route-error';
import {
  deleteFounderReviewMedia,
  getFounderReviewMedia,
} from '@/lib/founder-review/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

interface RouteParams {
  readonly params: Promise<{ readonly id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  try {
    const blob = await getFounderReviewMedia({
      id,
      userIdentity: userId,
      range: request.headers.get('range'),
    });
    const headers = new Headers({
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline',
      'Content-Type': blob.blob.contentType,
      ETag: blob.blob.etag,
    });
    for (const header of ['accept-ranges', 'content-length', 'content-range']) {
      const value = blob.headers.get(header);
      if (value) headers.set(header, value);
    }
    return new Response(blob.stream, {
      headers,
      status: headers.has('content-range') ? 206 : 200,
    });
  } catch (error_) {
    return founderReviewErrorResponse(
      error_,
      '/api/inbox/founder-reviews/[id]/media'
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  try {
    const receipt = await deleteFounderReviewMedia({
      id,
      userIdentity: userId,
    });
    return NextResponse.json(
      { ok: true, receipt },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error_) {
    return founderReviewErrorResponse(
      error_,
      '/api/inbox/founder-reviews/[id]/media'
    );
  }
}
