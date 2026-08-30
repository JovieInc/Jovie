/**
 * Library Audio Upload Token
 *
 * Issues a Vercel Blob presigned upload URL so the browser can attach audio
 * to a catalog release without routing large audio bodies through Next.js.
 *
 * Uses `handleUploadPresigned` + `issueSignedToken` so the route works with
 * Vercel OIDC federation (no static BLOB_READ_WRITE_TOKEN required).
 */

import { issueSignedToken } from '@vercel/blob';
import {
  type HandleUploadPresignedBody,
  handleUploadPresigned,
} from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { getAudioBlobPathPrefix } from '@/lib/audio/blob-path';
import {
  ALLOWED_AUDIO_MIME_TYPES,
  AUDIO_MAX_FILE_SIZE_BYTES,
} from '@/lib/audio/constants';
import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  try {
    const body = (await request.json()) as HandleUploadPresignedBody;

    const jsonResponse = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async pathname => {
        const { profile } = await getSessionContext({
          clerkUserId,
          requireUser: true,
          requireProfile: false,
        });

        if (!profile) {
          throw new Error('Creator profile not found');
        }
        if (
          !pathname.startsWith(
            getAudioBlobPathPrefix('library', clerkUserId)
          ) &&
          !pathname.startsWith(getAudioBlobPathPrefix('chat', clerkUserId))
        ) {
          throw new Error('Invalid audio upload pathname');
        }

        const token = await issueSignedToken({
          pathname,
          operations: ['put'],
          allowedContentTypes: [...ALLOWED_AUDIO_MIME_TYPES],
          maximumSizeInBytes: AUDIO_MAX_FILE_SIZE_BYTES,
        });

        return {
          token,
          urlOptions: {
            allowedContentTypes: [...ALLOWED_AUDIO_MIME_TYPES],
            maximumSizeInBytes: AUDIO_MAX_FILE_SIZE_BYTES,
          },
        };
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
