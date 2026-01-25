import { and, asc, eq, inArray, not } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { invalidateSocialLinksCache } from '@/lib/cache';
import { db } from '@/lib/db';
import { batchUpdateSocialLinks, type SocialLinkUpdate } from '@/lib/db/batch';
import { creatorProfiles, socialLinks } from '@/lib/db/schema';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { logger } from '@/lib/utils/logger';
import { detectPlatform } from '@/lib/utils/platform-detection';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Schema for updating social links via admin
 */
const updateAdminSocialLinksSchema = z.object({
  profileId: z.string().uuid(),
  links: z.array(
    z.object({
      id: z.string().uuid().optional(),
      url: z.string().url(),
      label: z.string().optional(),
      platformType: z.string().optional(),
    })
  ),
});

type SocialLinkRow = {
  id: string;
  label: string;
  url: string;
  platform: string;
  platformType: string;
};

export async function GET(request: NextRequest) {
  try {
    const entitlements = await getCurrentUserEntitlements();

    if (!entitlements.isAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    if (!entitlements.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const profileId = request.nextUrl.searchParams.get('profileId');
    if (!profileId) {
      return NextResponse.json(
        { error: 'profileId is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const rows = await db
      .select({
        id: socialLinks.id,
        label: socialLinks.displayText,
        url: socialLinks.url,
        platform: socialLinks.platform,
        platformType: socialLinks.platformType,
      })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.creatorProfileId, profileId),
          not(eq(socialLinks.state, 'rejected'))
        )
      )
      .orderBy(asc(socialLinks.sortOrder));

    const mapped: SocialLinkRow[] = rows.map(row => ({
      id: row.id,
      label: row.label ?? row.platform ?? 'Link',
      url: row.url,
      platform: row.platform,
      platformType: row.platformType,
    }));

    return NextResponse.json(
      { success: true, links: mapped },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Admin creator social links error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load social links' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * PUT - Update social links for a creator profile (admin only)
 *
 * Replaces all social links for the profile with the provided array.
 * Uses platform detection to normalize URLs and set platformType.
 */
export async function PUT(request: NextRequest) {
  try {
    const entitlements = await getCurrentUserEntitlements();

    if (!entitlements.isAuthenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    if (!entitlements.isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = updateAdminSocialLinksSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request body',
          details: parsed.error.issues,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { profileId, links } = parsed.data;

    // Verify profile exists and get username for cache invalidation
    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        usernameNormalized: creatorProfiles.usernameNormalized,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // Get existing links to determine which to delete
    const existingLinks = await db
      .select({ id: socialLinks.id })
      .from(socialLinks)
      .where(eq(socialLinks.creatorProfileId, profileId));

    const existingIds = new Set(existingLinks.map(l => l.id));
    const incomingIds = new Set(links.filter(l => l.id).map(l => l.id!));

    // Delete links that are no longer present
    const idsToDelete = [...existingIds].filter(id => !incomingIds.has(id));
    if (idsToDelete.length > 0) {
      await db.delete(socialLinks).where(inArray(socialLinks.id, idsToDelete));
    }

    // Batch upsert links - separate into inserts and updates
    const now = new Date();
    const linksToInsert: (typeof socialLinks.$inferInsert)[] = [];
    const linksToUpdate: SocialLinkUpdate[] = [];

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      if (!link) continue;

      const detected = detectPlatform(link.url);
      const platform = detected.platform.id;
      const platformType = link.platformType || detected.platform.icon;
      const normalizedUrl = detected.normalizedUrl || link.url;

      if (link.id && existingIds.has(link.id)) {
        // Collect for batch update
        linksToUpdate.push({
          id: link.id,
          url: normalizedUrl,
          platform,
          platformType,
          displayText: link.label || null,
          sortOrder: i,
        });
      } else {
        // Collect for batch insert
        linksToInsert.push({
          creatorProfileId: profileId,
          url: normalizedUrl,
          platform,
          platformType,
          displayText: link.label || null,
          sortOrder: i,
          state: 'active',
          isActive: true,
          sourceType: 'admin',
          confidence: '1.00',
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Execute batch operations
    if (linksToInsert.length > 0) {
      await db.insert(socialLinks).values(linksToInsert);
    }
    if (linksToUpdate.length > 0) {
      await batchUpdateSocialLinks(linksToUpdate);
    }

    // Invalidate cache to ensure public profile reflects changes
    await invalidateSocialLinksCache(profileId, profile.usernameNormalized);

    // Return updated links
    const updatedLinks = await db
      .select({
        id: socialLinks.id,
        label: socialLinks.displayText,
        url: socialLinks.url,
        platform: socialLinks.platform,
        platformType: socialLinks.platformType,
      })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.creatorProfileId, profileId),
          not(eq(socialLinks.state, 'rejected'))
        )
      )
      .orderBy(asc(socialLinks.sortOrder));

    const mapped: SocialLinkRow[] = updatedLinks.map(row => ({
      id: row.id,
      label: row.label ?? row.platform ?? 'Link',
      url: row.url,
      platform: row.platform,
      platformType: row.platformType,
    }));

    return NextResponse.json(
      { success: true, links: mapped },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Admin creator social links PUT error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save social links' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
