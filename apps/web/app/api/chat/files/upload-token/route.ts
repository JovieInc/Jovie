/**
 * Chat File Upload Token
 *
 * Issues a Vercel Blob presigned upload URL for generic file types
 * (video, documents, archives already expanded, other) so the browser
 * can upload directly to Blob without routing large bodies through Next.js.
 *
 * Uses `handleUploadPresigned` + `issueSignedToken` so the route works with
 * Vercel OIDC federation (no static BLOB_READ_WRITE_TOKEN required).
 */

import { NextRequest } from 'next/server';

import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { issueBlobPutUploadToken } from '@/lib/blob-presigned';
import { handleBlobPresignedUploadTokenRequest } from '@/lib/blob-presigned-route';

/** Max file size for generic chat file uploads (500 MB). */
const CHAT_FILE_MAX_SIZE = 500 * 1024 * 1024;

/** Allowed content types for generic chat file uploads. */
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/tiff',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'application/pdf',
  'text/plain',
  'application/octet-stream',
];

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

    return issueBlobPutUploadToken({
      pathname,
      allowedContentTypes: ALLOWED_CONTENT_TYPES,
      maximumSizeInBytes: CHAT_FILE_MAX_SIZE,
    });
  });
}
