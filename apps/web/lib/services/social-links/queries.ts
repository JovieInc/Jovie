/**
 * Social Links Service Queries
 *
 * Centralized social link data access layer.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import type { DashboardSocialLink, LinkSourceType, LinkState } from './types';

// Bounded limit to prevent OOM
const MAX_LINKS = 100;

/**
 * Get social links for a profile (public access, no auth required).
 */
export async function getLinksByProfileId(
  profileId: string
): Promise<DashboardSocialLink[]> {
  const rows = await db
    .select({
      id: socialLinks.id,
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
    .from(socialLinks)
    .where(eq(socialLinks.creatorProfileId, profileId))
    .orderBy(socialLinks.sortOrder)
    .limit(MAX_LINKS);

  return rows.map(r => mapRowToLink(r));
}

/**
 * Get social links for a profile owned by a specific user (auth required).
 */
export async function getLinksByProfileIdForUser(
  profileId: string,
  clerkUserId: string
): Promise<DashboardSocialLink[]> {
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
    .leftJoin(socialLinks, eq(socialLinks.creatorProfileId, creatorProfiles.id))
    .where(
      and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
    )
    .orderBy(socialLinks.sortOrder)
    .limit(MAX_LINKS);

  // Filter out null links from left join and rejected links
  return rows
    .filter(r => r.linkId !== null)
    .map(r => ({
      id: r.linkId!,
      platform: r.platform!,
      platformType: r.platformType ?? null,
      url: r.url!,
      sortOrder: r.sortOrder ?? 0,
      isActive: r.isActive ?? true,
      displayText: r.displayText ?? null,
      state: parseState(r.state, r.isActive),
      confidence: parseConfidence(r.confidence),
      sourcePlatform: r.sourcePlatform ?? null,
      sourceType: (r.sourceType ?? null) as LinkSourceType | null,
      evidence: r.evidence as DashboardSocialLink['evidence'],
      version: r.version ?? 1,
    }))
    .filter(link => link.state !== 'rejected');
}

/**
 * Get active links for public profile display.
 */
export async function getActiveLinksForProfile(
  profileId: string
): Promise<DashboardSocialLink[]> {
  const links = await getLinksByProfileId(profileId);
  return links.filter(link => link.state === 'active' && link.isActive);
}

/**
 * Get a single link by ID.
 */
export async function getLinkById(
  linkId: string
): Promise<DashboardSocialLink | null> {
  const [row] = await db
    .select({
      id: socialLinks.id,
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
    .from(socialLinks)
    .where(eq(socialLinks.id, linkId))
    .limit(1);

  return row ? mapRowToLink(row) : null;
}

// Helper to map DB row to DashboardSocialLink
function mapRowToLink(row: {
  id: string;
  platform: string;
  platformType: string;
  url: string;
  sortOrder: number | null;
  isActive: boolean | null;
  displayText: string | null;
  state: string;
  confidence: string;
  sourcePlatform: string | null;
  sourceType: string;
  evidence: unknown;
  version: number;
}): DashboardSocialLink {
  return {
    id: row.id,
    platform: row.platform,
    platformType: row.platformType ?? null,
    url: row.url,
    sortOrder: row.sortOrder ?? 0,
    isActive: row.isActive ?? true,
    displayText: row.displayText ?? null,
    state: parseState(row.state, row.isActive),
    confidence: parseConfidence(row.confidence),
    sourcePlatform: row.sourcePlatform ?? null,
    sourceType: (row.sourceType ?? null) as LinkSourceType | null,
    evidence: row.evidence as DashboardSocialLink['evidence'],
    version: row.version ?? 1,
  };
}

function parseState(state: string | null, isActive: boolean | null): LinkState {
  if (state === 'active' || state === 'suggested' || state === 'rejected') {
    return state;
  }
  return isActive ? 'active' : 'suggested';
}

function parseConfidence(confidence: string | number | null): number | null {
  if (confidence === null) return null;
  const parsed =
    typeof confidence === 'number'
      ? confidence
      : Number.parseFloat(String(confidence));
  return Number.isFinite(parsed) ? parsed : null;
}
