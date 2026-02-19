import { auth } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { chatAuditLog } from '@/lib/db/schema/chat';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { NO_CACHE_HEADERS } from '@/lib/http/headers';
import { getClientIP } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import { detectPlatform } from '@/lib/utils/platform-detection/detector';
import { validateSocialLinkUrl } from '@/lib/utils/url-validation';

const confirmLinkSchema = z.object({
  profileId: z.string().uuid(),
  platform: z.string().min(1),
  url: z.string().min(1).max(2048),
  normalizedUrl: z.string().min(1).max(2048),
});

/**
 * POST /api/chat/confirm-link
 *
 * Adds a social link to the artist's profile after chat confirmation.
 * Validates ownership, detects platform, and inserts the link.
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

  const parseResult = confirmLinkSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parseResult.error.flatten() },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  const { profileId, platform, normalizedUrl } = parseResult.data;

  try {
    // Verify profile ownership
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

    // Insert the social link
    await db.insert(socialLinks).values({
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
    });

    // Audit log
    const ipAddress = getClientIP(req);
    const userAgent = req.headers.get('user-agent');

    await db.insert(chatAuditLog).values({
      userId,
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
      { success: true, platform: detected.platform.id },
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
