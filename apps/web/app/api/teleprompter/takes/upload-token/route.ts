import {
  type HandleUploadPresignedBody,
  handleUploadPresigned,
} from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { defineRoute } from '@/lib/api/route-pipeline';
import {
  type SignedInRouteInput,
  signedInAccess,
} from '@/lib/api/signed-in-access';
import { issueBlobPutUploadToken } from '@/lib/blob-presigned';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  isOwnedTakeVideoPath,
  TELEPROMPTER_TAKE_ALLOWED_CONTENT_TYPES,
  TELEPROMPTER_TAKE_MAX_BYTES,
} from '@/lib/teleprompter/takes/contract';
import { teleprompterTakeErrorResponse } from '@/lib/teleprompter/takes/route-error';
import { TeleprompterTakeError } from '@/lib/teleprompter/takes/server';

export const runtime = 'nodejs';

const ROUTE = '/api/teleprompter/takes/upload-token';

export const POST = defineRoute(
  { route: ROUTE, access: signedInAccess() },
  async ({ auth, request }: SignedInRouteInput) => {
    try {
      const body = (await request.json()) as HandleUploadPresignedBody;
      const response = await handleUploadPresigned({
        body,
        request,
        getSignedToken: async pathname => {
          if (!isOwnedTakeVideoPath(auth.userId, pathname)) {
            throw new TeleprompterTakeError('invalid-take-path', 422);
          }
          return issueBlobPutUploadToken({
            pathname,
            allowedContentTypes: TELEPROMPTER_TAKE_ALLOWED_CONTENT_TYPES,
            maximumSizeInBytes: TELEPROMPTER_TAKE_MAX_BYTES,
          });
        },
      });
      return NextResponse.json(response, { headers: NO_STORE_HEADERS });
    } catch (error) {
      return teleprompterTakeErrorResponse(error, ROUTE);
    }
  }
);
