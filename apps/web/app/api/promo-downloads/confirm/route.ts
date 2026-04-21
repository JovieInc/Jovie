/**
 * Promo Download Confirm
 *
 * Called after client-side Blob upload completes. Records the uploaded
 * file in the promoDownloads table. The blob pathname (NOT the public URL)
 * is stored so download URLs are generated server-side with expiry.
 */

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { promoDownloads } from '@/lib/db/schema/promo-downloads';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

const confirmSchema = z.object({
  releaseId: z.string().uuid(),
  title: z.string().min(1).max(200),
  blobUrl: z.string().url(),
  blobPathname: z.string().min(1),
  fileName: z.string().min(1),
  fileMimeType: z.string().min(1),
  fileSizeBytes: z.number().int().positive().optional(),
});

function slugify(title: string): string {
  let slug = '';

  for (const character of title.toLowerCase()) {
    const isLowercaseLetter = character >= 'a' && character <= 'z';
    const isDigit = character >= '0' && character <= '9';

    if (isLowercaseLetter || isDigit) {
      slug += character;
      continue;
    }

    if (slug.length > 0 && !slug.endsWith('-')) {
      slug += '-';
    }
  }

  while (slug.endsWith('-')) {
    slug = slug.slice(0, -1);
  }

  if (slug.length > 80) {
    slug = slug.slice(0, 80);
    while (slug.endsWith('-')) {
      slug = slug.slice(0, -1);
    }
  }

  return slug;
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
      blobPathname,
      fileName,
      fileMimeType,
      fileSizeBytes,
    } = parsed.data;

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

    // Get next position for this release
    const [maxPos] = await db
      .select({
        max: drizzleSql<number>`COALESCE(MAX(${promoDownloads.position}), -1)`,
      })
      .from(promoDownloads)
      .where(eq(promoDownloads.releaseId, releaseId));

    const nextPosition = (maxPos?.max ?? -1) + 1;

    // Generate unique slug
    let slug = slugify(title);
    if (!slug) slug = 'download';

    // Insert promo download record (store pathname, NOT public URL)
    const [record] = await db
      .insert(promoDownloads)
      .values({
        creatorProfileId: profile.id,
        releaseId,
        title,
        slug,
        fileUrl: blobPathname,
        fileName,
        fileSizeBytes: fileSizeBytes ?? null,
        fileMimeType,
        position: nextPosition,
      })
      .returning();

    return NextResponse.json(
      { success: true, promoDownload: record },
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
