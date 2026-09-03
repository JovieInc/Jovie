/**
 * Promo Download Upload Token
 *
 * Issues a Vercel Blob presigned upload URL so the browser can upload
 * audio files directly to Blob storage (bypassing the 4.5MB serverless body limit).
 * Pro-gated.
 *
 * Uses `handleUploadPresigned` + `issueSignedToken` so the route works with
 * Vercel OIDC federation (no static BLOB_READ_WRITE_TOKEN required).
 */

import {
  type HandleUploadPresignedBody,
  handleUploadPresigned,
} from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { getAudioBlobPathPrefix } from '@/lib/audio/blob-path';
import {
  AUDIO_FORMAT_REGISTRY,
  AUDIO_UPLOAD_POLICIES,
} from '@/lib/audio/constants';
import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { issueBlobPutUploadToken } from '@/lib/blob-presigned';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

const PROMO_POLICY = AUDIO_UPLOAD_POLICIES.promo_download;

const MAX_FILE_SIZE_BYTES = PROMO_POLICY.maxFileSizeBytes;

const ALLOWED_MIME_TYPES = AUDIO_FORMAT_REGISTRY.filter(format =>
  (PROMO_POLICY.formatIds as readonly string[]).includes(format.id)
).flatMap(format => format.mimeTypes);

export async function POST(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  try {
    const body = (await request.json()) as HandleUploadPresignedBody;
    const { user, profile } = await getSessionContext({
      clerkUserId,
      requireUser: true,
      requireProfile: false,
    });

    const jsonResponse = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async pathname => {
        if (!profile) {
          throw new Error('Creator profile not found');
        }
        if (
          !pathname.startsWith(
            getAudioBlobPathPrefix('promo_download', clerkUserId)
          )
        ) {
          throw new Error('Invalid audio upload pathname');
        }

        if (!user.isPro) {
          throw new Error('Pro plan required for promo downloads');
        }

        return issueBlobPutUploadToken({
          pathname,
          allowedContentTypes: ALLOWED_MIME_TYPES,
          maximumSizeInBytes: MAX_FILE_SIZE_BYTES,
        });
      },
    });

    return NextResponse.json(jsonResponse, { headers: NO_STORE_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json(
      { error: message },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
