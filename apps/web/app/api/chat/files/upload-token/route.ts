/**
 * Chat File Upload Token
 *
 * Issues a Vercel Blob presigned upload URL for non-audio attachments (images,
 * video, documents) so the browser can upload directly to Blob without routing
 * large bodies through Next.js. Audio goes through
 * `/api/library/audio/upload-token`.
 *
 * Every pathname must sit under the caller's own owner-scoped prefix
 * (`jovie/files/<surface>/<userId>/`) and the allowed MIME set + size come from
 * the ONE file policy in `@/lib/media/file-policy` (JOV-5872).
 *
 * Uses `handleUploadPresigned` + `issueSignedToken` so the route works with
 * Vercel OIDC federation (no static BLOB_READ_WRITE_TOKEN required).
 */

import { NextRequest } from 'next/server';

import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { issueBlobPutUploadToken } from '@/lib/blob-presigned';
import { handleBlobPresignedUploadTokenRequest } from '@/lib/blob-presigned-route';
import {
  FILE_UPLOAD_POLICIES,
  getAllowedUploadContentTypes,
  resolveFileUploadSurface,
} from '@/lib/media/file-policy';

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

    const surface = resolveFileUploadSurface(pathname, clerkUserId);
    if (!surface) {
      throw new Error('Invalid file upload pathname');
    }

    return issueBlobPutUploadToken({
      pathname,
      allowedContentTypes: getAllowedUploadContentTypes(surface),
      maximumSizeInBytes: FILE_UPLOAD_POLICIES[surface].maxFileSizeBytes,
    });
  });
}
