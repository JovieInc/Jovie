/**
 * Promo Download Confirm
 *
 * Called after client-side Blob upload completes. Records the uploaded
 * file in the promoDownloads table. The blob pathname (NOT the public URL)
 * is stored so download URLs are generated server-side with expiry.
 */

import { createHash } from 'node:crypto';
import { head } from '@vercel/blob';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AUDIO_UPLOAD_POLICIES,
  getAudioFormatByMimeType,
  isSupportedAudioMimeType,
  SUPPORTED_AUDIO_FORMAT_LABELS,
} from '@/lib/audio/constants';
import { isPromoDownloadAudioUploadPath } from '@/lib/audio/upload-paths';
import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { promoDownloads } from '@/lib/db/schema/promo-downloads';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

const BLOB_METADATA_TIMEOUT_MS = 5_000;

const confirmSchema = z.object({
  releaseId: z.string().uuid(),
  title: z.string().min(1).max(200),
  blobUrl: z.string().url(),
  blobPathname: z.string().min(1),
  fileName: z.string().min(1),
  fileMimeType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
});

function slugify(title: string): string {
  const normalized = title.toLowerCase();
  let slug = '';
  let previousWasHyphen = false;

  for (const character of normalized) {
    const code = character.codePointAt(0) ?? 0;
    const isAsciiLowercase = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;

    if (isAsciiLowercase || isDigit) {
      slug += character;
      previousWasHyphen = false;
      continue;
    }

    if (!previousWasHyphen && slug.length > 0) {
      slug += '-';
      previousWasHyphen = true;
    }
  }

  while (slug.endsWith('-')) {
    slug = slug.slice(0, -1);
  }

  slug = slug.slice(0, 80);
  while (slug.endsWith('-')) {
    slug = slug.slice(0, -1);
  }

  return slug;
}

function createBlobSlug(blobPathname: string): string {
  const fileName = blobPathname.split('/').at(-1) ?? 'download';
  const base = slugify(fileName) || 'download';
  const digest = createHash('sha256')
    .update(blobPathname)
    .digest('hex')
    .slice(0, 12);
  return `${base.slice(0, 67)}-${digest}`;
}

export async function POST(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = confirmSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.format() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const {
      releaseId,
      title,
      blobUrl,
      blobPathname,
      fileName,
      fileMimeType,
      fileSizeBytes,
    } = parsed.data;

    if (!isSupportedAudioMimeType(fileMimeType)) {
      return NextResponse.json(
        {
          error: `Unsupported audio type. Use ${SUPPORTED_AUDIO_FORMAT_LABELS.join(', ')}.`,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (fileSizeBytes > AUDIO_UPLOAD_POLICIES.promo_download.maxFileSizeBytes) {
      return NextResponse.json(
        { error: 'Audio must be 150 MB or smaller.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Verify user owns this release via their creator profile and has Pro
    const { user, profile } = await getSessionContext({
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

    if (!user.isPro) {
      return NextResponse.json(
        { error: 'Pro plan required' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    // Verify release belongs to this creator
    const [release] = await db
      .select({ id: discogReleases.id })
      .from(discogReleases)
      .where(
        and(
          eq(discogReleases.id, releaseId),
          eq(discogReleases.creatorProfileId, profile.id)
        )
      )
      .limit(1);

    if (!release) {
      return NextResponse.json(
        { error: 'Release not found or not yours' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    if (!isPromoDownloadAudioUploadPath(releaseId, blobPathname)) {
      return NextResponse.json(
        { error: 'Uploaded audio does not belong to this release.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    let blob;
    try {
      blob = await head(blobUrl, {
        abortSignal: AbortSignal.timeout(BLOB_METADATA_TIMEOUT_MS),
      });
    } catch {
      return NextResponse.json(
        { error: 'Uploaded audio could not be verified.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const blobFormat = getAudioFormatByMimeType(blob.contentType);
    if (
      blob.url !== blobUrl ||
      blob.pathname !== blobPathname ||
      blob.size !== fileSizeBytes ||
      !blobFormat ||
      blob.size > AUDIO_UPLOAD_POLICIES.promo_download.maxFileSizeBytes
    ) {
      return NextResponse.json(
        { error: 'Uploaded audio metadata does not match the stored file.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Get next position for this release
    const [maxPos] = await db
      .select({
        max: drizzleSql<number>`COALESCE(MAX(${promoDownloads.position}), -1)`,
      })
      .from(promoDownloads)
      .where(eq(promoDownloads.releaseId, releaseId));

    const nextPosition = (maxPos?.max ?? -1) + 1;

    // The Blob-derived slug makes replay confirmation idempotent under the
    // existing (release_id, slug) unique index, including concurrent requests.
    const slug = createBlobSlug(blob.pathname);

    // Insert promo download record (store pathname, NOT public URL)
    const [insertedRecord] = await db
      .insert(promoDownloads)
      .values({
        creatorProfileId: profile.id,
        releaseId,
        title,
        slug,
        fileUrl: blobPathname,
        fileName,
        fileSizeBytes: blob.size,
        fileMimeType: blobFormat.canonicalMimeType,
        position: nextPosition,
      })
      .onConflictDoNothing({
        target: [promoDownloads.releaseId, promoDownloads.slug],
      })
      .returning();

    if (!insertedRecord) {
      const [existingRecord] = await db
        .select()
        .from(promoDownloads)
        .where(
          and(
            eq(promoDownloads.releaseId, releaseId),
            eq(promoDownloads.slug, slug)
          )
        )
        .limit(1);

      if (existingRecord) {
        return NextResponse.json(
          { success: true, promoDownload: existingRecord },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }

      throw new Error('Promo download conflict could not be resolved');
    }

    return NextResponse.json(
      { success: true, promoDownload: insertedRecord },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    captureError('Promo download confirm error', err);
    return NextResponse.json(
      { error: 'Failed to confirm upload' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
