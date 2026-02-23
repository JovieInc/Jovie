import { auth } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { chatAuditLog } from '@/lib/db/schema/chat';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { NO_CACHE_HEADERS } from '@/lib/http/headers';
import { getClientIP } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';

const confirmRemoveLinkSchema = z.object({
  profileId: z.string().uuid(),
  linkId: z.string().uuid(),
});

/**
 * POST /api/chat/confirm-remove-link
 *
 * Removes a social link from the artist's profile after chat confirmation.
 * Validates ownership, soft-deletes the link (state='rejected', isActive=false).
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_CACHE_HEADERS }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  const parseResult = confirmRemoveLinkSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parseResult.error.flatten() },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  const { profileId, linkId } = parseResult.data;

  try {
    // Verify profile ownership (same pattern as confirm-edit)
    const profile = await db.query.creatorProfiles.findFirst({
      where: eq(creatorProfiles.id, profileId),
      columns: { id: true, userId: true },
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_CACHE_HEADERS }
      );
    }

    if (profile.userId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized - not your profile' },
        { status: 403, headers: NO_CACHE_HEADERS }
      );
    }

    // Fetch the link to verify it exists and belongs to this profile
    const [link] = await db
      .select({
        id: socialLinks.id,
        platform: socialLinks.platform,
        url: socialLinks.url,
      })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.id, linkId),
          eq(socialLinks.creatorProfileId, profileId)
        )
      )
      .limit(1);

    if (!link) {
      return NextResponse.json(
        { error: 'Link not found' },
        { status: 404, headers: NO_CACHE_HEADERS }
      );
    }

    // Soft-delete the link
    await db
      .update(socialLinks)
      .set({
        state: 'rejected',
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(socialLinks.id, linkId));

    // Audit log
    const ipAddress = getClientIP(req);
    const userAgent = req.headers.get('user-agent');

    await db.insert(chatAuditLog).values({
      userId,
      creatorProfileId: profileId,
      action: 'remove_social_link',
      field: 'social_links',
      previousValue: JSON.stringify({
        platform: link.platform,
        url: link.url,
      }),
      newValue: null,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    return NextResponse.json(
      { success: true, platform: link.platform },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    logger.error('[confirm-remove-link] Error removing link:', error);
    Sentry.captureException(error, {
      tags: { feature: 'ai-chat', operation: 'confirm-remove-link' },
      extra: { userId, profileId, linkId },
    });
    return NextResponse.json(
      { error: 'Failed to remove link' },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
