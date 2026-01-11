'use server';

/**
 * Social links types, constants, and server actions.
 *
 * This module provides the ProfileSocialLink interface, DSP platform constants,
 * and server actions for fetching social links associated with creator profiles.
 */

import { and, eq } from 'drizzle-orm';
import { unstable_noStore as noStore } from 'next/cache';
import { getCachedAuth } from '@/lib/auth/cached';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { creatorProfiles, socialLinks, users } from '@/lib/db/schema';

/**
 * Minimal link shape for initializing DashboardLinks client from the server.
 * Contains all necessary fields for displaying and managing social links.
 */
export interface ProfileSocialLink {
  /** Unique identifier for the social link */
  id: string;
  /** Platform identifier (e.g., 'spotify', 'instagram') */
  platform: string;
  /** Platform type category (e.g., 'dsp', 'social') */
  platformType?: string | null;
  /** Full URL to the social profile or content */
  url: string;
  /** Display order for the link (lower = higher priority) */
  sortOrder: number | null;
  /** Whether the link is currently active */
  isActive: boolean | null;
  /** Custom display text for the link */
  displayText?: string | null;
  /** Current state of the link in the review workflow */
  state?: 'active' | 'suggested' | 'rejected';
  /** Confidence score for auto-detected links (0-1) */
  confidence?: number | null;
  /** Platform from which this link was discovered */
  sourcePlatform?: string | null;
  /** How the link was added to the system */
  sourceType?: 'manual' | 'admin' | 'ingested' | null;
  /** Evidence supporting auto-detected links */
  evidence?: {
    sources?: string[];
    signals?: string[];
    linkType?: string | null;
  } | null;
  /** Optimistic locking version for concurrent edit detection */
  version?: number;
}

/**
 * NOTE: DSP_PLATFORMS and DspPlatform type moved to canonical source.
 * Import from: @/lib/services/social-links/types
 *
 * This module now imports these from the centralized location to avoid
 * exporting non-async constants from a 'use server' file.
 */

/**
 * Fetches social links for a given profile owned by the current user.
 *
 * This server action queries the database for all social links associated
 * with the specified profile, ensuring the current user owns the profile.
 * Links are returned sorted by sortOrder and filtered to exclude rejected links.
 *
 * @param profileId - The ID of the creator profile to fetch links for
 * @returns Array of ProfileSocialLink objects for the profile
 * @throws Error if the user is not authenticated
 */
export async function getProfileSocialLinks(
  profileId: string
): Promise<ProfileSocialLink[]> {
  // Prevent caching of user-specific data
  noStore();

  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  return await withDbSession(async clerkUserId => {
    // Query against creatorProfiles with ownership check and left-join links
    const rows = await db
      .select({
        profileId: creatorProfiles.id,
        linkId: socialLinks.id,
        platform: socialLinks.platform,
        platformType: socialLinks.platformType,
        url: socialLinks.url,
        sortOrder: socialLinks.sortOrder,
        isActive: socialLinks.isActive,
        displayText: socialLinks.displayText,
        state: socialLinks.state,
        confidence: socialLinks.confidence,
        sourcePlatform: socialLinks.sourcePlatform,
        sourceType: socialLinks.sourceType,
        evidence: socialLinks.evidence,
        version: socialLinks.version,
      })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .leftJoin(
        socialLinks,
        eq(socialLinks.creatorProfileId, creatorProfiles.id)
      )
      .where(
        and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
      )
      .orderBy(socialLinks.sortOrder);

    // If the profile does not belong to the user, rows will be empty
    // Map only existing link rows (filter out null linkId from left join)
    const links: ProfileSocialLink[] = rows
      .filter(r => r.linkId !== null)
      .map(r => {
        const state =
          (r.state as 'active' | 'suggested' | 'rejected' | null) ??
          (r.isActive ? 'active' : 'suggested');
        if (state === 'rejected') return null;
        const parsedConfidence =
          typeof r.confidence === 'number'
            ? r.confidence
            : Number.parseFloat(String(r.confidence ?? '0'));

        return {
          id: r.linkId!,
          platform: r.platform!,
          platformType: r.platformType ?? null,
          url: r.url!,
          sortOrder: r.sortOrder ?? 0,
          isActive: state === 'active',
          displayText: r.displayText ?? null,
          state,
          confidence: Number.isFinite(parsedConfidence) ? parsedConfidence : 0,
          sourcePlatform: r.sourcePlatform,
          sourceType: r.sourceType ?? null,
          evidence: r.evidence as {
            sources?: string[];
            signals?: string[];
          } | null,
          version: r.version ?? 1,
        };
      })
      .filter((link): link is NonNullable<typeof link> => Boolean(link));

    return links;
  });
}
