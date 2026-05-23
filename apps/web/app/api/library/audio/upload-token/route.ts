/**
 * Library Audio Upload Token
 *
 * Generates a Vercel Blob client upload token so the browser can attach audio
 * to a catalog release without routing large audio bodies through Next.js.
 */

import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

const MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024;

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/aac',
  'audio/aiff',
  'audio/flac',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-aiff',
  'audio/x-flac',
  'audio/x-m4a',
  'audio/x-wav',
]);

export async function POST(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async _pathname => {
        const { profile } = await getSessionContext({
          clerkUserId,
          requireUser: true,
          requireProfile: false,
        });

        if (!profile) {
          throw new Error('Creator profile not found');
        }

        return {
          allowedContentTypes: [...ALLOWED_AUDIO_MIME_TYPES],
          maximumSizeInBytes: MAX_FILE_SIZE_BYTES,
          tokenPayload: JSON.stringify({
            creatorProfileId: profile.id,
            userId: clerkUserId,
          }),
        };
      },
      onUploadCompleted: async () => {
        // The client calls /api/library/audio/confirm after upload so the DB
        // update can verify release ownership before attaching the blob URL.
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
