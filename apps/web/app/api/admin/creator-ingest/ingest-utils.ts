import { randomUUID } from 'crypto';
import { and, eq, max } from 'drizzle-orm';
import { type DbType } from '@/lib/db';
import { creatorProfiles, socialLinks } from '@/lib/db/schema';
import {
  calculateAndStoreFitScore,
  updatePaidTierScore,
} from '@/lib/fit-scoring';
import {
  enqueueFollowupIngestionJobs,
  normalizeAndMergeExtraction,
} from '@/lib/ingestion/processor';
import { IngestionStatusManager } from '@/lib/ingestion/status-manager';
import {
  isValidHandle,
  normalizeHandle,
} from '@/lib/ingestion/strategies/linktree';
import { logger } from '@/lib/utils/logger';
import { normalizeUrl } from '@/lib/utils/platform-detection/normalizer';

// Default claim token expiration: 30 days
const CLAIM_TOKEN_EXPIRY_DAYS = 30;

// Music platforms that should have empty link display text by default
const MUSIC_PLATFORMS = [
  'spotify',
  'apple_music',
  'soundcloud',
  'tidal',
] as const;

/**
 * Determine the display text for a social link based on platform type.
 * Music platforms get empty display text (unless a specific name is provided),
 * while other platforms use the platform name.
 *
 * @param platformId - Platform identifier (e.g., 'spotify', 'instagram')
 * @param platformName - Default platform name to use
 * @param customName - Optional custom name (e.g., Spotify artist name)
 * @returns Display text for the link
 */
export function getLinkDisplayText(
  platformId: string,
  platformName: string,
  customName?: string | null
): string {
  if (customName) return customName;
  const isMusicPlatform = MUSIC_PLATFORMS.includes(
    platformId as (typeof MUSIC_PLATFORMS)[number]
  );
  return isMusicPlatform ? '' : platformName;
}

/**
 * Generate a claim token with expiration date.
 * Claim tokens allow creators to claim unclaimed profiles.
 *
 * @returns Object with claimToken UUID and claimTokenExpiresAt date
 */
export function generateClaimToken(): {
  claimToken: string;
  claimTokenExpiresAt: Date;
} {
  const claimToken = randomUUID();
  const claimTokenExpiresAt = new Date();
  claimTokenExpiresAt.setDate(
    claimTokenExpiresAt.getDate() + CLAIM_TOKEN_EXPIRY_DAYS
  );
  return { claimToken, claimTokenExpiresAt };
}

export async function findAvailableHandle(
  tx: DbType,
  baseHandle: string
): Promise<string | null> {
  const MAX_LEN = 30;
  const normalizedBase = baseHandle.slice(0, MAX_LEN);
  const maxAttempts = 20;

  for (let i = 0; i < maxAttempts; i++) {
    const suffix = i === 0 ? '' : `-${i}`;
    const trimmedBase = normalizedBase.slice(0, MAX_LEN - suffix.length);
    const candidate = `${trimmedBase}${suffix}`;
    if (!isValidHandle(candidate)) continue;

    const [existing] = await tx
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, candidate))
      .limit(1);

    if (!existing) {
      return candidate;
    }
  }

  return null;
}

/**
 * Idempotently add a social link to a creator profile.
 * Checks if the link already exists, and if not, computes the next sortOrder.
 * Returns true if a new link was added, false if it already existed.
 */
export async function addSocialLinkIdempotent(
  tx: DbType,
  creatorProfileId: string,
  platform: string,
  url: string,
  title: string
): Promise<boolean> {
  // Check if link already exists
  const [existingLink] = await tx
    .select({ id: socialLinks.id })
    .from(socialLinks)
    .where(
      and(
        eq(socialLinks.creatorProfileId, creatorProfileId),
        eq(socialLinks.platform, platform),
        eq(socialLinks.url, url)
      )
    )
    .limit(1);

  if (existingLink) {
    // Link already exists, skip insertion
    return false;
  }

  // Compute next sortOrder (max + 1, or 0 if no links exist)
  const [result] = await tx
    .select({ maxOrder: max(socialLinks.sortOrder) })
    .from(socialLinks)
    .where(eq(socialLinks.creatorProfileId, creatorProfileId));

  const nextSortOrder =
    result?.maxOrder !== null && result?.maxOrder !== undefined
      ? result.maxOrder + 1
      : 0;

  // Insert the new link
  await tx.insert(socialLinks).values({
    creatorProfileId,
    platform,
    platformType: platform,
    url,
    displayText: title,
    sortOrder: nextSortOrder,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return true;
}

/**
 * Platform-specific handle extraction strategies.
 * Maps hostname patterns to extraction logic for different social platforms.
 */
const PLATFORM_EXTRACTION_STRATEGIES: Record<
  string,
  {
    hosts: string[];
    extract: (segments: string[]) => string | null;
  }
> = {
  youtube: {
    hosts: ['youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtu.be'],
    extract: (segments: string[]): string | null => {
      let handle = segments[0];
      // Handle @username or /channel/ID or /c/name or /user/name
      if (handle?.startsWith('@')) {
        return handle.slice(1);
      }
      if (
        (handle === 'channel' || handle === 'c' || handle === 'user') &&
        segments[1]
      ) {
        return segments[1];
      }
      return handle;
    },
  },
  tiktok: {
    hosts: ['tiktok.com', 'www.tiktok.com'],
    extract: (segments: string[]): string | null => {
      const handle = segments[0];
      // Handle @username format
      return handle?.startsWith('@') ? handle.slice(1) : handle;
    },
  },
  linkedin: {
    hosts: ['linkedin.com', 'www.linkedin.com'],
    extract: (segments: string[]): string | null => {
      const handle = segments[0];
      // Handle /in/username or /company/name
      if ((handle === 'in' || handle === 'company') && segments[1]) {
        return segments[1];
      }
      return handle;
    },
  },
  reddit: {
    hosts: ['reddit.com', 'www.reddit.com'],
    extract: (segments: string[]): string | null => {
      const handle = segments[0];
      // Handle /user/username or /u/username
      if ((handle === 'user' || handle === 'u') && segments[1]) {
        return segments[1];
      }
      return handle;
    },
  },
  spotify: {
    hosts: ['spotify.com', 'www.spotify.com', 'open.spotify.com'],
    extract: (segments: string[]): string | null => {
      const handle = segments[0];
      // Handle /artist/ID or /user/username
      if (handle === 'artist' && segments[1]) {
        // Store the full artist ID with prefix for later API lookup
        return `artist-${segments[1]}`;
      }
      if (handle === 'user' && segments[1]) {
        return segments[1];
      }
      // Playlists aren't creator profiles
      if (handle === 'playlist') {
        return null;
      }
      return handle;
    },
  },
};

/**
 * Extract username/handle from a social platform URL.
 * Uses platform-specific strategies to handle different URL formats.
 *
 * @param url - Social platform profile URL
 * @returns Extracted handle/username, or null if extraction fails
 */
export function extractHandleFromSocialUrl(url: string): string | null {
  try {
    const parsed = new URL(normalizeUrl(url));
    const hostname = parsed.hostname.toLowerCase();
    const segments = parsed.pathname.split('/').filter(Boolean);

    if (segments.length === 0) {
      return null;
    }

    // Find matching platform strategy
    const strategy = Object.values(PLATFORM_EXTRACTION_STRATEGIES).find(s =>
      s.hosts.includes(hostname)
    );

    // Extract handle using platform strategy or fallback to first segment
    let handle = strategy ? strategy.extract(segments) : segments[0];

    if (!handle) {
      return null;
    }

    // Clean up the handle
    handle = handle
      .replace(/^@/, '') // Remove @ prefix
      .replace(/[?#].*/, '') // Remove query strings/fragments (safe: greedy match, no backtracking)
      .toLowerCase();

    // Validate handle format (30 char limit to match downstream validation)
    if (handle.length > 30) {
      return null;
    }

    // Only allow alphanumeric, underscores, hyphens, and periods
    if (!/^[a-z0-9._-]+$/.test(handle)) {
      return null;
    }

    return handle;
  } catch {
    return null;
  }
}

/**
 * Process profile extraction: merge links, enqueue follow-up jobs, and calculate fit score.
 *
 * This consolidates the shared logic used in both re-ingest and new profile flows.
 * Handles errors gracefully and ensures ingestion status is marked appropriately.
 *
 * @param tx - Database transaction
 * @param profile - Profile information for merging
 * @param extraction - Extracted profile data with links and metadata
 * @param displayName - Display name to use if not locked
 * @returns Object with mergeError if link processing failed
 */
export async function processProfileExtraction(
  tx: DbType,
  profile: {
    id: string;
    usernameNormalized: string;
    avatarUrl: string | null;
    displayName: string | null;
    avatarLockedByUser: boolean;
    displayNameLocked: boolean;
  },
  extraction: {
    links: Array<{ url: string; platformId?: string; title?: string }>;
    avatarUrl?: string | null;
    hasPaidTier?: boolean | null;
    displayName?: string | null;
  },
  displayName: string | null
): Promise<{ mergeError: string | null }> {
  let mergeError: string | null = null;

  // Merge extracted links into profile
  try {
    await normalizeAndMergeExtraction(
      tx,
      {
        id: profile.id,
        usernameNormalized: profile.usernameNormalized,
        avatarUrl: profile.avatarUrl,
        displayName: profile.displayName ?? displayName,
        avatarLockedByUser: profile.avatarLockedByUser,
        displayNameLocked: profile.displayNameLocked,
      },
      extraction
    );

    // Enqueue follow-up ingestion jobs for discovered links
    await enqueueFollowupIngestionJobs({
      tx,
      creatorProfileId: profile.id,
      currentDepth: 0,
      extraction,
    });
  } catch (error) {
    mergeError =
      error instanceof Error ? error.message : 'Link extraction failed';
    logger.error('Link merge failed', {
      profileId: profile.id,
      error: mergeError,
    });
  }

  // Mark ingestion as idle or failed based on merge result
  await IngestionStatusManager.markIdleOrFailed(tx, profile.id, mergeError);

  // Calculate fit score for the profile
  try {
    if (typeof extraction.hasPaidTier === 'boolean') {
      await updatePaidTierScore(tx, profile.id, extraction.hasPaidTier);
    }
    await calculateAndStoreFitScore(tx, profile.id);
  } catch (fitScoreError) {
    logger.warn('Fit score calculation failed', {
      profileId: profile.id,
      error:
        fitScoreError instanceof Error
          ? fitScoreError.message
          : 'Unknown error',
    });
  }

  return { mergeError };
}

export const normalizeIngestionHandle = normalizeHandle;
