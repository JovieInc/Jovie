/**
 * Promo Download Upload Token
 *
 * Generates a Vercel Blob client upload token so the browser can upload
 * audio files directly to Blob storage (bypassing the 4.5MB serverless body limit).
 * Pro-gated.
 */

import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AUDIO_UPLOAD_POLICIES,
  SUPPORTED_AUDIO_MIME_TYPES,
} from '@/lib/audio/constants';
import { isPromoDownloadAudioUploadPath } from '@/lib/audio/upload-paths';
import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

const uploadPayloadSchema = z.object({ releaseId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  try {
    const body = (await request.json()) as HandleUploadBody;
    const { user, profile } = await getSessionContext({
      clerkUserId,
      requireUser: true,
      requireProfile: false,
    });

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!profile) {
          throw new Error('Creator profile not found');
        }

        if (!user.isPro) {
          throw new Error('Pro plan required for promo downloads');
        }

        const payload = uploadPayloadSchema.safeParse(
          clientPayload ? JSON.parse(clientPayload) : null
        );
        if (
          !payload.success ||
          !isPromoDownloadAudioUploadPath(payload.data.releaseId, pathname)
        ) {
          throw new Error('Invalid promo audio upload path');
        }

        const [release] = await db
          .select({ id: discogReleases.id })
          .from(discogReleases)
          .where(
            and(
              eq(discogReleases.id, payload.data.releaseId),
              eq(discogReleases.creatorProfileId, profile.id)
            )
          )
          .limit(1);
        if (!release) {
          throw new Error('Release not found or not yours');
        }

        return {
          allowedContentTypes: [...SUPPORTED_AUDIO_MIME_TYPES],
          maximumSizeInBytes:
            AUDIO_UPLOAD_POLICIES.promo_download.maxFileSizeBytes,
          tokenPayload: JSON.stringify({
            creatorProfileId: profile.id,
            releaseId: payload.data.releaseId,
            userId: clerkUserId,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // This callback fires after the client upload completes.
        // We don't insert the DB record here because the client
        // needs to call /api/promo-downloads/confirm with metadata.
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
