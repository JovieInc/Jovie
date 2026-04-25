import * as Sentry from '@sentry/nextjs';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { getOwnedChatProfile } from '@/lib/chat/profile-ownership';

import { db } from '@/lib/db';
import { chatAuditLog } from '@/lib/db/schema/chat';
import { socialLinks } from '@/lib/db/schema/links';
import { syncPrimaryMusicUrlsFromSocialLinks } from '@/lib/db/social-links-sync';
import { NO_CACHE_HEADERS } from '@/lib/http/headers';
import { getClientIP } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import { detectPlatform } from '@/lib/utils/platform-detection/detector';
import { validateSocialLinkUrl } from '@/lib/utils/url-validation';
import { httpUrlSchema } from '@/lib/validation/schemas/base';

const confirmLinkSchema = z.object({
  profileId: z.string().uuid(),
  platform: z.string().min(1),
  url: httpUrlSchema,
  normalizedUrl: httpUrlSchema,
});

/**
 * POST /api/chat/confirm-link
 *
 * Adds a social link to the artist's profile after chat confirmation.
 * Validates ownership, detects platform, and inserts the link.
 */
export async function POST(req: Request) {
  const { userId } = await getCachedAuth();
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

  const parseResult = confirmLinkSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parseResult.error.flatten() },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  const { profileId, platform, normalizedUrl } = parseResult.data;

  try {
    const profile = await getOwnedChatProfile({
      profileId,
      clerkUserId: userId,
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_CACHE_HEADERS }
      );
    }

    // Validate URL security
    const urlValidation = validateSocialLinkUrl(normalizedUrl);
    if (!urlValidation.valid) {
      return NextResponse.json(
        { error: urlValidation.error ?? 'Invalid URL' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // Re-detect platform server-side for safety
    const detected = detectPlatform(normalizedUrl);
    if (!detected.isValid) {
      return NextResponse.json(
        { error: detected.error ?? 'Unsupported platform URL' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // Check for existing link with same platform (prevent duplicates)
    const [existingLink] = await db
      .select({ id: socialLinks.id })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.creatorProfileId, profileId),
          eq(socialLinks.platform, detected.platform.id)
        )
      )
      .limit(1);

    let linkId: string;

    if (existingLink) {
      // Update existing link URL instead of creating duplicate
      await db
        .update(socialLinks)
        .set({
          url: detected.normalizedUrl,
          isActive: true,
          state: 'active',
          updatedAt: new Date(),
        })
        .where(eq(socialLinks.id, existingLink.id));
      linkId = existingLink.id;
    } else {
      // Insert new social link
      const rows = await db
        .insert(socialLinks)
        .values({
          creatorProfileId: profileId,
          platform: detected.platform.id,
          platformType: detected.platform.category,
          url: detected.normalizedUrl,
          displayText: null,
          sortOrder: 0,
          isActive: true,
          state: 'active',
          confidence: '1.00',
          sourceType: 'manual',
          version: 1,
        })
        .returning({ id: socialLinks.id });
      if (!rows[0]) {
        throw new Error('Insert returned no rows');
      }
      linkId = rows[0].id;
    }

    await syncPrimaryMusicUrlsFromSocialLinks(db, profileId);

    // Audit log
    const ipAddress = getClientIP(req);
    const userAgent = req.headers.get('user-agent');

    await db.insert(chatAuditLog).values({
      userId: profile.internalUserId,
      creatorProfileId: profileId,
      action: 'add_social_link',
      field: 'social_links',
      previousValue: null,
      newValue: JSON.stringify({
        platform: detected.platform.id,
        url: detected.normalizedUrl,
      }),
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    return NextResponse.json(
      { success: true, platform: detected.platform.id, linkId },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    logger.error('[confirm-link] Error adding link:', error);
    Sentry.captureException(error, {
      tags: { feature: 'ai-chat', operation: 'confirm-link' },
      extra: { userId, profileId, platform },
    });
    return NextResponse.json(
      { error: 'Failed to add link' },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
