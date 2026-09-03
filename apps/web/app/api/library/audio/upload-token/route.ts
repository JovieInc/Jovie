/**
 * Library Audio Upload Token
 *
 * Issues a Vercel Blob presigned upload URL so the browser can attach audio
 * to a catalog release without routing large audio bodies through Next.js.
 *
 * Uses `handleUploadPresigned` + `issueSignedToken` so the route works with
 * Vercel OIDC federation (no static BLOB_READ_WRITE_TOKEN required).
 */

import { NextRequest } from 'next/server';
import { getAudioBlobPathPrefix } from '@/lib/audio/blob-path';
import {
  ALLOWED_AUDIO_MIME_TYPES,
  AUDIO_MAX_FILE_SIZE_BYTES,
} from '@/lib/audio/constants';
import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { issueBlobPutUploadToken } from '@/lib/blob-presigned';
import { handleBlobPresignedUploadTokenRequest } from '@/lib/blob-presigned-route';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  return handleBlobPresignedUploadTokenRequest(request, async pathname => {
    const { profile } = await getSessionContext({
      clerkUserId,
      requireUser: true,
      requireProfile: false,
    });

    if (!profile) {
      throw new Error('Creator profile not found');
    }
    if (
      !pathname.startsWith(getAudioBlobPathPrefix('library', clerkUserId)) &&
      !pathname.startsWith(getAudioBlobPathPrefix('chat', clerkUserId))
    ) {
      throw new Error('Invalid audio upload pathname');
    }

    return issueBlobPutUploadToken({
      pathname,
      allowedContentTypes: [...ALLOWED_AUDIO_MIME_TYPES],
      maximumSizeInBytes: AUDIO_MAX_FILE_SIZE_BYTES,
    });
  });
}
