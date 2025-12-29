'use server';

/**
 * Server Actions for Social Links Management
 *
 * This module centralizes social links data fetching and mutations to ensure:
 * - Consistent caching via Next.js cache primitives
 * - Proper RLS enforcement via withDbSession
 * - No client-side fetching of server data
 * - Optimistic locking for concurrent edit detection
 *
 * @see agents.md Section 10.1 - Data Fetching Strategy
 */

import * as Sentry from '@sentry/nextjs';
import { and, eq, gt, inArray } from 'drizzle-orm';
import {
  unstable_noStore as noStore,
  revalidateTag,
  updateTag,
} from 'next/cache';
import type { ProfileSocialLink } from '@/app/app/dashboard/actions';
import { withDbSession, withDbSessionTx } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  creatorProfiles,
  dashboardIdempotencyKeys,
  socialLinks,
  users,
} from '@/lib/db/schema';
import { computeLinkConfidence } from '@/lib/ingestion/confidence';
import { maybeSetProfileAvatarFromLinks } from '@/lib/ingestion/magic-profile-avatar';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { validateSocialLinkUrl } from '@/lib/utils/url-validation';
import { isValidSocialPlatform } from '@/types';

/**
 * Idempotency key TTL (24 hours)
 */
const IDEMPOTENCY_KEY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Link data for saving
 */
export interface LinkSavePayload {
  platform: string;
  platformType?: string;
  url: string;
  sortOrder?: number;
  isActive?: boolean;
  displayText?: string | null;
  state?: 'active' | 'suggested' | 'rejected';
  confidence?: number;
  sourcePlatform?: string;
  sourceType?: 'manual' | 'admin' | 'ingested';
  evidence?: {
    sources?: string[];
    signals?: string[];
  };
}

export type FetchSocialLinksResult =
  | { success: true; links: ProfileSocialLink[] }
  | { success: false; error: string };

export type SaveSocialLinksResult =
  | { success: true; version: number }
  | {
      success: false;
      error: string;
      isConflict?: boolean;
      currentVersion?: number;
    };

export type UpdateLinkStateResult =
  | { success: true; link?: ProfileSocialLink; version: number }
  | { success: false; error: string };

/**
 * Fetch social links for a profile owned by the authenticated user
 *
 * This replaces client-side fetching via useLinksPersistence and useSuggestionSync
 *
 * @param profileId - The profile ID to fetch links for
 * @returns Links array or error response
 */
export async function fetchSocialLinks(
  profileId: string
): Promise<FetchSocialLinksResult> {
  noStore();

  if (!profileId) {
    return { success: false, error: 'Profile ID is required' };
  }

  try {
    return await withDbSession(async clerkUserId => {
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

      if (rows.length === 0) {
        return { success: false, error: 'Profile not found' };
      }

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
            confidence: Number.isFinite(parsedConfidence)
              ? parsedConfidence
              : 0,
            sourcePlatform: r.sourcePlatform ?? undefined,
            sourceType: (r.sourceType ?? 'manual') as
              | 'manual'
              | 'admin'
              | 'ingested',
            evidence: r.evidence as {
              sources?: string[];
              signals?: string[];
            } | null,
            version: r.version ?? 1,
          };
        })
        .filter((link): link is NonNullable<typeof link> => Boolean(link));

      return { success: true, links };
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return { success: false, error: 'Unauthorized' };
    }

    Sentry.captureException(error, {
      tags: { action: 'fetchSocialLinks', profileId },
    });

    console.error('Error fetching social links:', error);
    return { success: false, error: 'Failed to fetch links' };
  }
}

/**
 * Save social links for a profile with optimistic locking
 *
 * This replaces the PUT /api/dashboard/social-links endpoint calls
 *
 * @param profileId - The profile ID to save links for
 * @param links - Array of links to save
 * @param expectedVersion - Expected version for optimistic locking
 * @param idempotencyKey - Optional idempotency key for deduplication
 * @returns Success with new version or error response
 */
export async function saveSocialLinks(
  profileId: string,
  links: LinkSavePayload[],
  expectedVersion?: number,
  idempotencyKey?: string
): Promise<SaveSocialLinksResult> {
  noStore();

  if (!profileId) {
    return { success: false, error: 'Profile ID is required' };
  }

  // Validate platforms
  for (const link of links) {
    if (!isValidSocialPlatform(link.platform)) {
      return { success: false, error: 'Invalid platform' };
    }

    const validation = validateSocialLinkUrl(link.url);
    if (!validation.valid) {
      return { success: false, error: validation.error ?? 'Invalid URL' };
    }
  }

  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      // Check idempotency key
      if (idempotencyKey) {
        const [existing] = await db
          .select({
            responseStatus: dashboardIdempotencyKeys.responseStatus,
            responseBody: dashboardIdempotencyKeys.responseBody,
          })
          .from(dashboardIdempotencyKeys)
          .where(
            and(
              eq(dashboardIdempotencyKeys.key, idempotencyKey),
              eq(dashboardIdempotencyKeys.userId, clerkUserId),
              eq(dashboardIdempotencyKeys.endpoint, 'saveSocialLinks'),
              gt(dashboardIdempotencyKeys.expiresAt, new Date())
            )
          )
          .limit(1);

        if (existing && existing.responseStatus === 200) {
          const body = existing.responseBody as { version?: number };
          return { success: true, version: body.version ?? 1 };
        }
      }

      // Verify profile ownership
      const [profile] = await tx
        .select({
          id: creatorProfiles.id,
          usernameNormalized: creatorProfiles.usernameNormalized,
          avatarUrl: creatorProfiles.avatarUrl,
          avatarLockedByUser: creatorProfiles.avatarLockedByUser,
          userId: creatorProfiles.userId,
        })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.userId))
        .where(
          and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
        )
        .limit(1);

      if (!profile) {
        return { success: false, error: 'Profile not found' };
      }

      // Get existing links for version check
      const existingLinks = await tx
        .select({
          id: socialLinks.id,
          sourceType: socialLinks.sourceType,
          version: socialLinks.version,
        })
        .from(socialLinks)
        .where(eq(socialLinks.creatorProfileId, profileId));

      // Optimistic locking check
      if (expectedVersion !== undefined) {
        const currentVersion =
          existingLinks.length > 0
            ? Math.max(...existingLinks.map(l => l.version ?? 1))
            : 0;

        if (currentVersion !== expectedVersion) {
          return {
            success: false,
            error: 'Conflict: Links have been modified by another request',
            isConflict: true,
            currentVersion,
          };
        }
      }

      // Calculate next version
      const currentMaxVersion =
        existingLinks.length > 0
          ? Math.max(...existingLinks.map(l => l.version ?? 1))
          : 0;
      const nextVersion = currentMaxVersion + 1;

      // Delete manual/admin links (preserve ingested)
      const removableIds = existingLinks
        .filter(link => (link.sourceType ?? 'manual') !== 'ingested')
        .map(link => link.id);

      if (removableIds.length > 0) {
        await tx
          .delete(socialLinks)
          .where(inArray(socialLinks.id, removableIds));
      }

      // Insert new links
      if (links.length > 0) {
        const insertPayload: Array<typeof socialLinks.$inferInsert> = links.map(
          (l, idx) => {
            const detected = detectPlatform(l.url);
            const normalizedUrl = detected.normalizedUrl;
            const evidence = {
              sources: l.evidence?.sources ?? [],
              signals: l.evidence?.signals ?? [],
            };
            const scored = computeLinkConfidence({
              sourceType: l.sourceType ?? 'manual',
              signals: evidence.signals,
              sources: [...evidence.sources, 'dashboard'],
              usernameNormalized: profile.usernameNormalized ?? null,
              url: normalizedUrl,
              existingConfidence:
                typeof l.confidence === 'number' ? l.confidence : null,
            });
            const state =
              l.state ??
              (l.isActive === false || l.state === 'suggested'
                ? 'suggested'
                : scored.state);
            const confidence =
              typeof l.confidence === 'number'
                ? Number(l.confidence.toFixed(2))
                : scored.confidence;

            return {
              creatorProfileId: profileId,
              platform: l.platform,
              platformType: detected.platform.category,
              url: normalizedUrl,
              sortOrder: l.sortOrder ?? idx,
              state,
              isActive: state === 'active',
              confidence: confidence.toFixed(2),
              sourcePlatform: l.sourcePlatform,
              sourceType: l.sourceType ?? 'manual',
              evidence: {
                ...evidence,
                sources: Array.from(new Set(evidence.sources)),
                signals: Array.from(new Set(evidence.signals)),
              },
              displayText: l.displayText || null,
              version: nextVersion,
            };
          }
        );

        await tx.insert(socialLinks).values(insertPayload);
      }

      // Update version on remaining ingested links
      if (existingLinks.length > removableIds.length) {
        const ingestedIds = existingLinks
          .filter(link => link.sourceType === 'ingested')
          .map(link => link.id);
        if (ingestedIds.length > 0) {
          await tx
            .update(socialLinks)
            .set({ version: nextVersion, updatedAt: new Date() })
            .where(inArray(socialLinks.id, ingestedIds));
        }
      }

      // Store idempotency key
      if (idempotencyKey) {
        try {
          await db
            .insert(dashboardIdempotencyKeys)
            .values({
              key: idempotencyKey,
              userId: clerkUserId,
              endpoint: 'saveSocialLinks',
              responseStatus: 200,
              responseBody: { ok: true, version: nextVersion },
              expiresAt: new Date(Date.now() + IDEMPOTENCY_KEY_TTL_MS),
            })
            .onConflictDoNothing();
        } catch {
          // Non-critical
        }
      }

      // Non-blocking avatar enrichment
      void maybeSetProfileAvatarFromLinks({
        db,
        clerkUserId,
        profileId,
        userId: profile.userId ?? null,
        currentAvatarUrl: profile.avatarUrl ?? null,
        avatarLockedByUser: profile.avatarLockedByUser ?? null,
        links: links.map(link => link.url),
      }).catch(error => {
        Sentry.captureException(error, {
          tags: { operation: 'profile_enrichment', profileId },
        });
      });

      // Invalidate caches
      updateTag('dashboard-data');
      revalidateTag('dashboard-data', 'max');

      return { success: true, version: nextVersion };
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return { success: false, error: 'Unauthorized' };
    }

    Sentry.captureException(error, {
      tags: { action: 'saveSocialLinks', profileId },
    });

    console.error('Error saving social links:', error);
    return { success: false, error: 'Failed to save links' };
  }
}

/**
 * Accept or dismiss a suggested link
 *
 * This replaces the PATCH /api/dashboard/social-links endpoint calls
 *
 * @param profileId - The profile ID
 * @param linkId - The link ID to update
 * @param action - 'accept' or 'dismiss'
 * @returns Success with updated link or error response
 */
export async function updateLinkState(
  profileId: string,
  linkId: string,
  action: 'accept' | 'dismiss'
): Promise<UpdateLinkStateResult> {
  noStore();

  if (!profileId || !linkId) {
    return { success: false, error: 'Profile ID and Link ID are required' };
  }

  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      // Verify profile ownership
      const [profile] = await tx
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.userId))
        .where(
          and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
        )
        .limit(1);

      if (!profile) {
        return { success: false, error: 'Profile not found' };
      }

      // Get the link
      const [link] = await tx
        .select({
          id: socialLinks.id,
          creatorProfileId: socialLinks.creatorProfileId,
          version: socialLinks.version,
          platform: socialLinks.platform,
          platformType: socialLinks.platformType,
          url: socialLinks.url,
          sortOrder: socialLinks.sortOrder,
          displayText: socialLinks.displayText,
          confidence: socialLinks.confidence,
          sourcePlatform: socialLinks.sourcePlatform,
          sourceType: socialLinks.sourceType,
          evidence: socialLinks.evidence,
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
        return { success: false, error: 'Link not found' };
      }

      const nextVersion = (link.version ?? 1) + 1;

      if (action === 'accept') {
        await tx
          .update(socialLinks)
          .set({
            state: 'active',
            isActive: true,
            version: nextVersion,
            updatedAt: new Date(),
          })
          .where(eq(socialLinks.id, linkId));
      } else {
        await tx
          .update(socialLinks)
          .set({
            state: 'rejected',
            isActive: false,
            version: nextVersion,
            updatedAt: new Date(),
          })
          .where(eq(socialLinks.id, linkId));
      }

      // Invalidate caches
      updateTag('dashboard-data');
      revalidateTag('dashboard-data', 'max');

      // Return updated link for accept action
      if (action === 'accept') {
        const parsedConfidence =
          typeof link.confidence === 'number'
            ? link.confidence
            : Number.parseFloat(String(link.confidence ?? '0'));

        return {
          success: true,
          version: nextVersion,
          link: {
            id: link.id,
            platform: link.platform!,
            platformType: link.platformType ?? null,
            url: link.url!,
            sortOrder: link.sortOrder ?? 0,
            isActive: true,
            displayText: link.displayText ?? null,
            state: 'active' as const,
            confidence: Number.isFinite(parsedConfidence)
              ? parsedConfidence
              : 0,
            sourcePlatform: link.sourcePlatform ?? undefined,
            sourceType: (link.sourceType ?? 'manual') as
              | 'manual'
              | 'admin'
              | 'ingested',
            evidence: link.evidence as {
              sources?: string[];
              signals?: string[];
            } | null,
            version: nextVersion,
          },
        };
      }

      return { success: true, version: nextVersion };
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return { success: false, error: 'Unauthorized' };
    }

    Sentry.captureException(error, {
      tags: { action: 'updateLinkState', profileId, linkId },
    });

    console.error('Error updating link state:', error);
    return { success: false, error: 'Failed to update link' };
  }
}
