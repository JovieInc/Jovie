/**
 * Promo Download CRUD (PATCH / DELETE)
 *
 * Authenticated endpoints for artists to manage their promo download files.
 */

import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { promoDownloads } from '@/lib/db/schema/promo-downloads';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Verify ownership
    const [profile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId))
      .limit(1);

    if (!profile) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const [updated] = await db
      .update(promoDownloads)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(
        and(
          eq(promoDownloads.id, id),
          eq(promoDownloads.creatorProfileId, profile.id)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: true, promoDownload: updated },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    captureError('Promo download PATCH error', err);
    return NextResponse.json(
      { error: 'Update failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  try {
    const [profile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId))
      .limit(1);

    if (!profile) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const [deleted] = await db
      .delete(promoDownloads)
      .where(
        and(
          eq(promoDownloads.id, id),
          eq(promoDownloads.creatorProfileId, profile.id)
        )
      )
      .returning({ id: promoDownloads.id });

    if (!deleted) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    captureError('Promo download DELETE error', err);
    return NextResponse.json(
      { error: 'Delete failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
