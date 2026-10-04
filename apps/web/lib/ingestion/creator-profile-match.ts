import { and, eq, ilike } from 'drizzle-orm';
import { BASE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  detectPlatformFromUrl,
  extractHandleFromUrl,
} from '@/lib/utils/social-platform';
import { escapeLikePattern } from '@/lib/utils/sql';
import type { CreatorLookupPlatform } from './creator-lookup';

export interface ExistingProfileMatch {
  readonly username: string;
  readonly displayName: string | null;
  readonly profileUrl: string;
}

/**
 * Channel identity that distinguishes `/@handle`, `/channel/<id>`, and
 * `/c/<name>` forms. Comparing the raw token alone would merge three
 * different channels that happen to share a slug.
 */
export function youtubeChannelKey(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const first = parts[0]?.toLowerCase();
    if (!first) return null;
    if (first.startsWith('@')) return `handle:${first.slice(1)}`;
    if ((first === 'channel' || first === 'c') && parts[1]) {
      return `${first}:${parts[1].toLowerCase()}`;
    }
    return null;
  } catch {
    return null;
  }
}

/** ilike prefilter token for a YouTube channel key (`@x`, `channel/x`, `c/x`). */
function youtubeLikeToken(key: string): string {
  const [kind, value] = key.split(':', 2);
  return kind === 'handle' ? `/@${value}` : `/${kind}/${value}`;
}

/**
 * True when a stored URL points at the exact channel or handle the lookup
 * resolved to — not merely a same-slug account on another URL form.
 */
export function isSameSourceIdentity(
  platform: CreatorLookupPlatform,
  sourceUrl: string,
  candidateUrl: string
): boolean {
  if (platform === 'youtube') {
    const wanted = youtubeChannelKey(sourceUrl);
    return (
      wanted !== null &&
      detectPlatformFromUrl(candidateUrl).platform === 'youtube' &&
      youtubeChannelKey(candidateUrl) === wanted
    );
  }
  const wanted = extractHandleFromUrl(sourceUrl)?.toLowerCase();
  return (
    wanted !== undefined &&
    detectPlatformFromUrl(candidateUrl).platform === platform &&
    extractHandleFromUrl(candidateUrl)?.toLowerCase() === wanted
  );
}

async function candidates(
  platform: CreatorLookupPlatform,
  likeToken: string
): Promise<
  { username: string; displayName: string | null; url: string | null }[]
> {
  const pattern = `%${escapeLikePattern(likeToken)}%`;
  const linkRows = db
    .select({
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      url: socialLinks.url,
    })
    .from(socialLinks)
    .innerJoin(
      creatorProfiles,
      eq(socialLinks.creatorProfileId, creatorProfiles.id)
    )
    .where(
      and(
        eq(socialLinks.platform, platform),
        eq(socialLinks.isActive, true),
        eq(socialLinks.state, 'active'),
        eq(creatorProfiles.isPublic, true),
        ilike(socialLinks.url, pattern)
      )
    );
  if (platform !== 'youtube') return linkRows;

  const profileRows = db
    .select({
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      url: creatorProfiles.youtubeUrl,
    })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.isPublic, true),
        ilike(creatorProfiles.youtubeUrl, pattern)
      )
    );
  const [links, profiles] = await Promise.all([linkRows, profileRows]);
  // The profile's canonical youtubeUrl outranks an ingested social link.
  return [...profiles, ...links];
}

/**
 * Resolve a canonical source URL to the public Jovie profile already known to
 * hold it (by `creator_profiles.youtube_url` or an active matching
 * `social_links` row). Returns null when no verified identity match exists.
 */
export async function findProfileForSource(
  platform: CreatorLookupPlatform,
  sourceUrl: string
): Promise<ExistingProfileMatch | null> {
  const likeToken =
    platform === 'youtube'
      ? (() => {
          const key = youtubeChannelKey(sourceUrl);
          return key ? youtubeLikeToken(key) : null;
        })()
      : extractHandleFromUrl(sourceUrl);
  if (!likeToken) return null;

  for (const candidate of await candidates(platform, likeToken)) {
    if (
      candidate.url &&
      isSameSourceIdentity(platform, sourceUrl, candidate.url)
    ) {
      return {
        username: candidate.username,
        displayName: candidate.displayName,
        profileUrl: `${BASE_URL}/${encodeURIComponent(candidate.username)}`,
      };
    }
  }
  return null;
}
