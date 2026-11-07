import {
  type HandleUploadPresignedBody,
  handleUploadPresigned,
} from '@vercel/blob/client';
import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
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

export async function POST(request: NextRequest) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const body = (await request.json()) as HandleUploadPresignedBody;
    const response = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async pathname => {
        if (!isOwnedTakeVideoPath(userId, pathname)) {
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
  } catch (error_) {
    return teleprompterTakeErrorResponse(
      error_,
      '/api/teleprompter/takes/upload-token'
    );
  }
}
