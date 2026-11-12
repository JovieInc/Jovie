import { defineRoute } from '@/lib/api/route-pipeline';
import {
  type SignedInRouteInput,
  signedInAccess,
} from '@/lib/api/signed-in-access';
import { teleprompterTakeErrorResponse } from '@/lib/teleprompter/takes/route-error';
import { openTeleprompterTakeMedia } from '@/lib/teleprompter/takes/server';

export const runtime = 'nodejs';

interface RouteParams {
  readonly params: Promise<{ readonly takeId: string }>;
}

const ROUTE = '/api/teleprompter/takes/[takeId]/media';

export const GET = defineRoute(
  { route: ROUTE, access: signedInAccess() },
  async ({ auth, request }: SignedInRouteInput, { params }: RouteParams) => {
    const { takeId } = await params;
    try {
      const blob = await openTeleprompterTakeMedia(
        auth.userId,
        takeId,
        request.headers.get('range')
      );
      const headers = new Headers({
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline',
        'Content-Type': blob.blob.contentType,
        ETag: blob.blob.etag,
      });
      for (const header of [
        'accept-ranges',
        'content-length',
        'content-range',
      ]) {
        const value = blob.headers.get(header);
        if (value) headers.set(header, value);
      }
      return new Response(blob.stream, {
        headers,
        status: headers.has('content-range') ? 206 : 200,
      });
    } catch (error) {
      return teleprompterTakeErrorResponse(error, ROUTE);
    }
  }
);
