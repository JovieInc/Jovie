/**
 * Chat File Upload Token
 *
 * Generates a Vercel Blob client upload token for generic file types
 * (video, documents, archives already expanded, other) so the browser
 * can upload directly to Blob without routing large bodies through Next.js.
 */

import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';

import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

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
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: CHAT_FILE_MAX_SIZE,
          tokenPayload: JSON.stringify({
            creatorProfileId: profile.id,
            userId: clerkUserId,
          }),
        };
      },
      onUploadCompleted: async () => {
        // No server-side confirmation needed for generic file uploads;
        // the blob URL is used directly in the chat message.
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
