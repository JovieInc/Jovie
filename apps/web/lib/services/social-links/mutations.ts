/**
 * Social Links Service Mutations
 *
 * Centralized social link update operations.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { batchUpdateSortOrder } from '@/lib/db/batch';
import { socialLinks } from '@/lib/db/schema/links';
import type {
  CreateLinkData,
  DashboardSocialLink,
  UpdateLinkData,
} from './types';

/**
 * Create a new social link.
 */
export async function createLink(
  profileId: string,
  data: CreateLinkData
): Promise<DashboardSocialLink> {
  const [newLink] = await db
    .insert(socialLinks)
    .values({
      creatorProfileId: profileId,
      platform: data.platform,
      platformType: data.platformType ?? 'custom',
      url: data.url,
      displayText: data.displayText,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
      state: data.state ?? 'active',
      sourceType: data.sourceType ?? 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  // Invalidate cache for the profile
  // Note: We'd need the username to invalidate, which we don't have here
  // This is a limitation - caller should handle cache invalidation

  return {
    id: newLink.id,
    platform: newLink.platform,
    platformType: newLink.platformType ?? null,
    url: newLink.url,
    sortOrder: newLink.sortOrder ?? 0,
    isActive: newLink.isActive ?? true,
    displayText: newLink.displayText ?? null,
    state: newLink.state as DashboardSocialLink['state'],
    confidence: Number.parseFloat(newLink.confidence) || null,
    sourcePlatform: newLink.sourcePlatform ?? null,
    sourceType: newLink.sourceType as DashboardSocialLink['sourceType'],
    evidence: newLink.evidence as DashboardSocialLink['evidence'],
    version: newLink.version ?? 1,
  };
}

/**
 * Update an existing social link.
 */
export async function updateLink(
  linkId: string,
  data: UpdateLinkData
): Promise<DashboardSocialLink | null> {
  const [updated] = await db
    .update(socialLinks)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(socialLinks.id, linkId))
    .returning();

  if (!updated) return null;

  return {
    id: updated.id,
    platform: updated.platform,
    platformType: updated.platformType ?? null,
    url: updated.url,
    sortOrder: updated.sortOrder ?? 0,
    isActive: updated.isActive ?? true,
    displayText: updated.displayText ?? null,
    state: updated.state as DashboardSocialLink['state'],
    confidence: Number.parseFloat(updated.confidence) || null,
    sourcePlatform: updated.sourcePlatform ?? null,
    sourceType: updated.sourceType as DashboardSocialLink['sourceType'],
    evidence: updated.evidence as DashboardSocialLink['evidence'],
    version: updated.version ?? 1,
  };
}

/**
 * Delete a social link.
 */
export async function deleteLink(linkId: string): Promise<boolean> {
  const [deleted] = await db
    .delete(socialLinks)
    .where(eq(socialLinks.id, linkId))
    .returning({ id: socialLinks.id });

  return Boolean(deleted);
}

/**
 * Bulk update link sort orders.
 * Performance optimized: Uses single SQL statement instead of N individual updates.
 */
export async function reorderLinks(
  linkOrders: Array<{ id: string; sortOrder: number }>
): Promise<void> {
  // Performance optimization: Single batch update instead of N individual queries
  // This reduces database round trips from N to 1
  await batchUpdateSortOrder(socialLinks, linkOrders);
}

/**
 * Activate a link (set state to 'active').
 */
export async function activateLink(
  linkId: string
): Promise<DashboardSocialLink | null> {
  return updateLink(linkId, { state: 'active', isActive: true });
}

/**
 * Reject a link (set state to 'rejected').
 */
export async function rejectLink(
  linkId: string
): Promise<DashboardSocialLink | null> {
  return updateLink(linkId, { state: 'rejected', isActive: false });
}
