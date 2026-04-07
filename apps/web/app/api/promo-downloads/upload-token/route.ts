/**
 * Promo Download Upload Token
 *
 * Generates a Vercel Blob client upload token so the browser can upload
 * audio files directly to Blob storage (bypassing the 4.5MB serverless body limit).
 * Pro-gated.
 */

import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { getCreatorProfileForUser } from '@/lib/promo-downloads/queries';

export const runtime = 'nodejs';

const MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024; // 150MB

const ALLOWED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/flac',
  'audio/aiff',
  'audio/mp4',
  'audio/x-m4a',
]);

export async function POST(request: NextRequest) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async _pathname => {
        const profile = await getCreatorProfileForUser(userId);

        if (!profile) {
          throw new Error('Creator profile not found');
        }

        if (!profile.isPro) {
          throw new Error('Pro plan required for promo downloads');
        }

        return {
          allowedContentTypes: [...ALLOWED_MIME_TYPES],
          maximumSizeInBytes: MAX_FILE_SIZE_BYTES,
          tokenPayload: JSON.stringify({
            creatorProfileId: profile.id,
            userId,
          }),
        };
      },
      onUploadCompleted: async () => {
        // Client calls /api/promo-downloads/confirm with metadata after upload.
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
