import 'server-only';

import { and, eq } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import {
  CACHE_TAGS,
  createProfileTag,
  sanitizeCacheTags,
} from '@/lib/cache/tags';
import { db } from '@/lib/db';
// eslint-disable-next-line no-restricted-imports -- Schema barrel import needed for the contact type alias
import type { CreatorContact as DbCreatorContact } from '@/lib/db/schema';
import type { DiscogRelease } from '@/lib/db/schema/content';
import { creatorPixels } from '@/lib/db/schema/pixels';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { checkBoolean } from '@/lib/entitlements/registry';
import { calculateRequiredProfileCompletion } from '@/lib/profile/completion';
import { mergeProfileTheme } from '@/lib/profile/profile-theme';
import { isPublicProfilePublished } from '@/lib/profile/public-profile-access';
import { getProfileWithLinks as getCreatorProfileWithLinks } from '@/lib/services/profile';
import { isDspPlatform } from '@/lib/services/social-links/types';
import { toISOStringSafe } from '@/lib/utils/date';
import { logger } from '@/lib/utils/logger';
import { isReservedUsername } from '@/lib/validation/username-core';
import type { CreatorProfile, LegacySocialLink } from '@/types/db';
import type { PressPhoto } from '@/types/press-photos';
import { mapProfileWithLinksToCreatorProfile } from './profile-mapper';
import { shouldBypassPublicProfileQaCache } from './public-profile-qa';

/**
 * Shape returned to every consumer of the public profile loader. Stable
 * across both the base profile route and per-mode routes (plan PR 3a-2b
 * and following).
 */
export interface PublicProfileLoaderResult {
  readonly profile: CreatorProfile | null;
  readonly links: LegacySocialLink[];
  readonly contacts: DbCreatorContact[];
  readonly creatorIsPro: boolean;
  readonly creatorClerkId: string | null;
  /**
   * Creator's own Meta pixel ID when the creator is entitled to ad pixels
   * (canAccessAdPixels) and has Meta enabled in dashboard pixel config.
   * Null otherwise — the browser pixel never fires for unentitled creators.
   */
  readonly creatorMetaPixelId: string | null;
  readonly genres: string[] | null;
  readonly latestRelease: DiscogRelease | null;
  readonly pressPhotos: PressPhoto[];
  readonly status: 'ok' | 'not_found' | 'error';
}

const RESERVED_PROFILE_NOT_FOUND: PublicProfileLoaderResult = {
  profile: null,
  links: [],
  contacts: [],
  creatorIsPro: false,
  creatorClerkId: null,
  creatorMetaPixelId: null,
  genres: null,
  latestRelease: null,
  pressPhotos: [],
  status: 'not_found',
};

/**
 * Reads the creator's Meta pixel ID for browser fbq firing on public
 * surfaces. Entitlement-gated (canAccessAdPixels); requires the master and
 * Meta toggles plus a configured pixel ID. Fails closed to null.
 */
async function getCreatorMetaPixelId(
  profileId: string,
  plan: string | null
): Promise<string | null> {
  if (!checkBoolean(plan, 'canAccessAdPixels')) return null;

  try {
    const [row] = await db
      .select({ facebookPixelId: creatorPixels.facebookPixelId })
      .from(creatorPixels)
      .where(
        and(
          eq(creatorPixels.profileId, profileId),
          eq(creatorPixels.enabled, true),
          eq(creatorPixels.facebookEnabled, true)
        )
      )
      .limit(1);

    const pixelId = row?.facebookPixelId?.trim();
    return pixelId || null;
  } catch (error) {
    logger.warn(
      'Creator Meta pixel lookup failed',
      { error, creatorProfileId: profileId },
      'public-profile'
    );
    return null;
  }
}

function calculateProfileCompletion(
  result: {
    displayName?: string | null;
    avatarUrl?: string | null;
    spotifyUrl?: string | null;
    appleMusicUrl?: string | null;
    youtubeUrl?: string | null;
    socialLinks?: Array<{
      platform?: string | null;
      platformType?: string | null;
    }> | null;
  },
  username: string
): number {
  const hasMusicLinks =
    Boolean(result.spotifyUrl || result.appleMusicUrl || result.youtubeUrl) ||
    Boolean(
      result.socialLinks?.some(link => {
        const platform = link.platform?.toLowerCase();
        return (
          link.platformType === 'dsp' ||
          (typeof platform === 'string' && isDspPlatform(platform))
        );
      })
    );

  return calculateRequiredProfileCompletion({
    displayName: result.displayName,
    avatarUrl: result.avatarUrl,
    handle: username,
    hasMusicLinks,
  }).percentage;
}

const NOT_FOUND_RESULT: PublicProfileLoaderResult = RESERVED_PROFILE_NOT_FOUND;

const ERROR_RESULT: PublicProfileLoaderResult = {
  ...RESERVED_PROFILE_NOT_FOUND,
  status: 'error',
};

/**
 * Fetches the full profile body (profile, links, contacts, pixel) in one
 * storage pass. The body re-checks publication itself, so a fresh call is a
 * complete authoritative read on its own.
 */
const fetchProfileAndLinks = async (
  username: string
): Promise<PublicProfileLoaderResult> => {
  if (isReservedUsername(username)) {
    return RESERVED_PROFILE_NOT_FOUND;
  }

  try {
    // Publication is authoritative on every request. Bypass Redis and do not
    // let a previous public payload grant access after withdrawal or a failed
    // invalidation. React.cache below only deduplicates within this request.
    const result = await getCreatorProfileWithLinks(username, {
      skipCache: true,
      throwOnError: true,
    });

    if (!result || !isPublicProfilePublished(result.isPublic)) {
      // Expected 404 — profile not found or not public. No Sentry capture needed;
      // these are normal from typos, crawlers, and enumeration traffic (JOV-1321).
      return {
        profile: null,
        links: [],
        contacts: [],
        creatorIsPro: false,
        creatorClerkId: null,
        creatorMetaPixelId: null,
        genres: null,
        latestRelease: null,
        pressPhotos: [],
        status: 'not_found',
      };
    }

    const creatorIsPro = Boolean(result.userIsPro);
    const creatorClerkId =
      typeof result.userClerkId === 'string' ? result.userClerkId : null;

    const mappedProfile = mapProfileWithLinksToCreatorProfile(result, {
      profileCompletionPct: calculateProfileCompletion(result, username),
    });
    const profile = {
      ...mappedProfile,
      // Accent extraction downloads remote avatar bytes and belongs in
      // ingestion/profile saves rather than each anonymous render.
      theme: mergeProfileTheme(mappedProfile.theme, {}),
    };

    const links: LegacySocialLink[] =
      result.socialLinks?.map(link => ({
        id: link.id,
        artist_id: result.id,
        platform: (link.platform ?? '').toLowerCase(),
        url: link.url,
        clicks: link.clicks || 0,
        created_at: toISOStringSafe(link.createdAt),
      })) ?? [];

    // If the artist has a venmoHandle on their profile but no venmo social link,
    // inject a synthetic venmo link so tipping works on the public profile page.
    const hasVenmoSocialLink = links.some(l => l.platform === 'venmo');
    if (!hasVenmoSocialLink && result.venmoHandle) {
      const handle = result.venmoHandle.replace(/^@/, '');
      links.push({
        id: `venmo-${result.id}`,
        artist_id: result.id,
        platform: 'venmo',
        url: `https://venmo.com/${encodeURIComponent(handle)}`,
        clicks: 0,
        created_at: toISOStringSafe(result.createdAt),
      });
    }

    const contacts: DbCreatorContact[] = result.contacts ?? [];
    const latestRelease = result.latestRelease ?? null;
    const creatorMetaPixelId = await getCreatorMetaPixelId(
      result.id,
      result.userPlan ?? null
    );

    return {
      profile,
      links,
      contacts,
      creatorIsPro,
      creatorClerkId,
      creatorMetaPixelId,
      genres: result.genres ?? null,
      latestRelease,
      pressPhotos: result.pressPhotos ?? [],
      status: 'ok',
    };
  } catch (error) {
    logger.error(
      'Error fetching creator profile',
      {
        error,
        route: '/[username]',
        username,
      },
      'public-profile'
    );
    return {
      profile: null,
      links: [],
      contacts: [],
      creatorIsPro: false,
      creatorClerkId: null,
      creatorMetaPixelId: null,
      genres: null,
      latestRelease: null,
      pressPhotos: [],
      status: 'error',
    };
  }
};

const PUBLICATION_AUTHORITY_TIMEOUT_MS = 5_000;
const PROFILE_BODY_CACHE_TTL_SECONDS = 3600;

interface PublicationAuthority {
  readonly id: string;
  readonly isPublic: unknown;
}

/**
 * The per-request publication decision (JOV-8629). One indexed primary-key
 * style read on `username_normalized`. Storage failure or timeout throws so the
 * caller renders an error, never a previously cached public body.
 */
async function readPublicationAuthority(
  username: string
): Promise<PublicationAuthority | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const rows = await Promise.race([
      db
        .select({ id: creatorProfiles.id, isPublic: creatorProfiles.isPublic })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.usernameNormalized, username))
        .limit(1),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Publication authority read timeout')),
          PUBLICATION_AUTHORITY_TIMEOUT_MS
        );
      }),
    ]);
    return rows[0] ?? null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

class NonCacheableProfileBodyError extends Error {
  constructor(readonly result: PublicProfileLoaderResult) {
    super(`Profile body is not cacheable: ${result.status}`);
    this.name = 'NonCacheableProfileBodyError';
  }
}

/**
 * Cross-request cache for the non-authority profile body. Only `ok` bodies are
 * retained; invalidateProfileCache() expires them through the same
 * `profile:<handle>` / `profiles-all` tags (immediately on privacy changes).
 * A cached body is never consulted on its own: getProfileAndLinks only returns
 * it after a fresh publication read for the same profile id permits it.
 */
async function readCachedProfileBody(
  username: string
): Promise<PublicProfileLoaderResult | null> {
  try {
    return await unstable_cache(
      async () => {
        const body = await fetchProfileAndLinks(username);
        if (body.status !== 'ok') throw new NonCacheableProfileBodyError(body);
        return body;
      },
      ['public-profile-body', username],
      {
        tags: sanitizeCacheTags([
          CACHE_TAGS.PUBLIC_PROFILE,
          createProfileTag(username),
        ]),
        revalidate: PROFILE_BODY_CACHE_TTL_SECONDS,
      }
    )();
  } catch {
    // Non-ok bodies and cache-store failures fall back to a fresh read.
    return null;
  }
}

function shouldBypassProfileBodyCache(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development' ||
    shouldBypassPublicProfileQaCache()
  );
}

/**
 * Fresh publication decision, cached non-authority body (JOV-8629 §6.2,
 * "cache non-authority facts behind a fresh publication decision"). The
 * authority read and the cached body read overlap; the body is only returned
 * when current storage says this exact profile id is published.
 */
async function loadPublicProfile(
  username: string
): Promise<PublicProfileLoaderResult> {
  if (isReservedUsername(username)) return RESERVED_PROFILE_NOT_FOUND;
  if (shouldBypassProfileBodyCache()) return fetchProfileAndLinks(username);

  const [authority, cachedBody] = await Promise.all([
    readPublicationAuthority(username).then(
      value => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error })
    ),
    readCachedProfileBody(username),
  ]);

  if (!authority.ok) {
    logger.error(
      'Error reading public profile publication',
      { error: authority.error, route: '/[username]', username },
      'public-profile'
    );
    return ERROR_RESULT;
  }
  if (!authority.value || !isPublicProfilePublished(authority.value.isPublic)) {
    return NOT_FOUND_RESULT;
  }
  if (cachedBody?.profile?.id === authority.value.id) {
    return cachedBody;
  }
  // Cache miss, store failure, or a handle now owned by a different profile.
  return fetchProfileAndLinks(username);
}

/** Per-request deduplication of the fresh-authority profile load. */
export const getProfileAndLinks = cache(
  async (username: string): Promise<PublicProfileLoaderResult> => {
    return loadPublicProfile(username.toLowerCase());
  }
);
