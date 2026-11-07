import { requireAuth } from '@/lib/auth/require-auth';
import { teleprompterTakeErrorResponse } from '@/lib/teleprompter/takes/route-error';
import { openTeleprompterTakeMedia } from '@/lib/teleprompter/takes/server';

export const runtime = 'nodejs';

interface RouteParams {
  readonly params: Promise<{ readonly takeId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const { takeId } = await params;
  try {
    const blob = await openTeleprompterTakeMedia(
      userId,
      takeId,
      request.headers.get('range')
    );
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
    return teleprompterTakeErrorResponse(
      error_,
      '/api/teleprompter/takes/[takeId]/media'
    );
  }
}
