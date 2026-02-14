import { eq } from 'drizzle-orm';
import { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { BASE_URL } from '@/constants/app';
import { HOSTNAME } from '@/constants/domains';
import { getBlogPostSlugs } from '@/lib/blog/getBlogPosts';
import { db } from '@/lib/db';
import {
  discogReleases,
  discogTracks,
} from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { env } from '@/lib/env-server';

/**
 * Sitemap configuration for jov.ie
 *
 * Includes profile pages, release/track smart link pages, and marketing pages
 * (blog, legal, homepage) since everything is served from the unified jov.ie domain.
 *
 * NOTE: Google limits a single sitemap to 50,000 URLs. If the combined total of
 * profiles + releases + tracks exceeds this, migrate to generateSitemaps() for
 * paginated sitemap index support.
 */

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headersList = await headers();
  const host = headersList.get('host') || '';

  const isProfileDomain = host === HOSTNAME || host === `www.${HOSTNAME}`;

  if (isProfileDomain) {
    return buildProfileSitemap();
  }

  return buildMarketingSitemap();
}

/**
 * Sitemap for jov.ie - profile pages + release/track smart link pages
 */
async function buildProfileSitemap(): Promise<MetadataRoute.Sitemap> {
  // NEXT_PHASE is injected by Next.js at build time, must use process.env
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    // During build, return homepage only (profiles fetched at runtime)
    return [
      {
        url: BASE_URL,
        lastModified: new Date(),
        changeFrequency: 'daily' as const,
        priority: 1,
      },
    ];
  }

  let profiles: Array<{ username: string; updatedAt: Date | null }> = [];
  let releases: Array<{
    username: string;
    slug: string;
    updatedAt: Date | null;
    artworkUrl: string | null;
  }> = [];
  let tracks: Array<{
    username: string;
    slug: string;
    updatedAt: Date | null;
    artworkUrl: string | null;
  }> = [];

  try {
    if (!env.DATABASE_URL) {
      return [
        {
          url: BASE_URL,
          lastModified: new Date(),
          changeFrequency: 'daily' as const,
          priority: 1,
        },
      ];
    }

    // Get all public creator profiles, releases, and tracks in parallel
    [profiles, releases, tracks] = await Promise.all([
      db
        .select({
          username: creatorProfiles.username,
          updatedAt: creatorProfiles.updatedAt,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.isPublic, true)),

      // Releases joined to their public creator for URL construction
      db
        .select({
          username: creatorProfiles.usernameNormalized,
          slug: discogReleases.slug,
          updatedAt: discogReleases.updatedAt,
          artworkUrl: discogReleases.artworkUrl,
        })
        .from(discogReleases)
        .innerJoin(
          creatorProfiles,
          eq(discogReleases.creatorProfileId, creatorProfiles.id)
        )
        .where(eq(creatorProfiles.isPublic, true)),

      // Tracks joined to their release (for artwork) and public creator
      db
        .select({
          username: creatorProfiles.usernameNormalized,
          slug: discogTracks.slug,
          updatedAt: discogTracks.updatedAt,
          artworkUrl: discogReleases.artworkUrl,
        })
        .from(discogTracks)
        .innerJoin(
          discogReleases,
          eq(discogTracks.releaseId, discogReleases.id)
        )
        .innerJoin(
          creatorProfiles,
          eq(discogTracks.creatorProfileId, creatorProfiles.id)
        )
        .where(eq(creatorProfiles.isPublic, true)),
    ]);
  } catch (error) {
    console.error('Error fetching data for sitemap:', error);
  }

  // Profile homepage
  const homePage = {
    url: BASE_URL,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 1,
  };

  // Creator profile pages on jov.ie
  const profilePages = profiles.map(profile => ({
    url: `${BASE_URL}/${profile.username}`,
    lastModified: profile.updatedAt || new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  // Release smart link pages with album artwork as sitemap images
  const releasePages = releases.map(release => ({
    url: `${BASE_URL}/${release.username}/${release.slug}`,
    lastModified: release.updatedAt || new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
    ...(release.artworkUrl && { images: [release.artworkUrl] }),
  }));

  // Track smart link pages with parent release artwork as sitemap images
  const trackPages = tracks.map(track => ({
    url: `${BASE_URL}/${track.username}/${track.slug}`,
    lastModified: track.updatedAt || new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
    ...(track.artworkUrl && { images: [track.artworkUrl] }),
  }));

  return [homePage, ...profilePages, ...releasePages, ...trackPages];
}

/**
 * Sitemap for marketing pages (blog, legal)
 */
async function buildMarketingSitemap(): Promise<MetadataRoute.Sitemap> {
  const blogSlugs = await getBlogPostSlugs();

  const marketingPages = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/legal/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/legal/terms`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    },
  ];

  const blogPages = blogSlugs.map(slug => ({
    url: `${BASE_URL}/blog/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [...marketingPages, ...blogPages];
}
