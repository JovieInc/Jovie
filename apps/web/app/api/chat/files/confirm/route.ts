/**
 * Chat File Confirm
 *
 * Called after a client-side Blob upload of a non-audio attachment (image,
 * video, PDF) completes. Verifies ownership and runs a magic-byte sniff so a
 * mislabeled or spoofed file cannot ride a trusted MIME type into chat
 * (mirrors `/api/chat/audio`'s use of `lib/audio/blob-verifier.ts`).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { chatToolSchema } from '@/lib/chat/strict-schema';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  FileBlobVerificationError,
  verifyFileBlob,
} from '@/lib/media/file-blob-verifier';
import { FILE_UPLOAD_POLICIES } from '@/lib/media/file-policy';

export const runtime = 'nodejs';

const chatFileConfirmSchema = chatToolSchema({
  blobPathname: z.string().min(1),
  fileName: z.string().min(1),
  fileMimeType: z.string(),
});

export async function POST(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  try {
    const parsed = chatFileConfirmSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.format() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { profile } = await getSessionContext({
      clerkUserId,
      requireUser: true,
      requireProfile: false,
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const verifiedBlob = await verifyFileBlob({
      blobPathname: parsed.data.blobPathname,
      userId: clerkUserId,
      surface: 'chat',
      fileName: parsed.data.fileName,
      fileMimeType: parsed.data.fileMimeType,
      maxSizeBytes: FILE_UPLOAD_POLICIES.chat.maxFileSizeBytes,
    });

    return NextResponse.json(
      {
        success: true,
        blobUrl: verifiedBlob.url,
        contentType: verifiedBlob.canonicalMimeType,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    if (err instanceof FileBlobVerificationError) {
      return NextResponse.json(
        { error: err.message, code: err.code, rule: err.rule, cta: err.cta },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    captureError('Chat file confirm error', err);
    return NextResponse.json(
      { error: 'Failed to confirm file upload' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
