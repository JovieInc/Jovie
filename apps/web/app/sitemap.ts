import { eq } from 'drizzle-orm';
import { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { MARKETING_URL, PROFILE_URL } from '@/constants/app';
import { PROFILE_HOSTNAME } from '@/constants/domains';
import { getBlogPostSlugs } from '@/lib/blog/getBlogPosts';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';

/**
 * Multi-domain sitemap configuration
 *
 * Serves domain-specific sitemaps based on the requesting hostname:
 * - jov.ie: Only profile pages (creator profiles)
 * - meetjovie.com: Only marketing pages (blog, legal, homepage)
 *
 * This follows Google's recommendation that sitemaps should only include
 * URLs from the same domain they're served from.
 */

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headersList = await headers();
  const host = headersList.get('host') || '';

  const isProfileDomain =
    host === PROFILE_HOSTNAME || host === `www.${PROFILE_HOSTNAME}`;

  if (isProfileDomain) {
    return buildProfileSitemap();
  }

  return buildMarketingSitemap();
}

/**
 * Sitemap for jov.ie - only profile pages
 */
async function buildProfileSitemap(): Promise<MetadataRoute.Sitemap> {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    // During build, return homepage only (profiles fetched at runtime)
    return [
      {
        url: PROFILE_URL,
        lastModified: new Date(),
        changeFrequency: 'daily' as const,
        priority: 1,
      },
    ];
  }

  let profiles: Array<{ username: string; updatedAt: Date | null }> = [];

  try {
    if (!process.env.DATABASE_URL) {
      return [
        {
          url: PROFILE_URL,
          lastModified: new Date(),
          changeFrequency: 'daily' as const,
          priority: 1,
        },
      ];
    }

    // Get all public creator profiles
    profiles = await db
      .select({
        username: creatorProfiles.username,
        updatedAt: creatorProfiles.updatedAt,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.isPublic, true));
  } catch (error) {
    console.error('Error fetching profiles for sitemap:', error);
  }

  // Profile homepage
  const homePage = {
    url: PROFILE_URL,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 1,
  };

  // Creator profile pages on jov.ie
  const profilePages = profiles.map(profile => ({
    url: `${PROFILE_URL}/${profile.username}`,
    lastModified: profile.updatedAt || new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [homePage, ...profilePages];
}

/**
 * Sitemap for meetjovie.com - marketing pages only
 */
async function buildMarketingSitemap(): Promise<MetadataRoute.Sitemap> {
  const blogSlugs = await getBlogPostSlugs();

  // Marketing pages on meetjovie.com
  const marketingPages = [
    {
      url: MARKETING_URL,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    },
    {
      url: `${MARKETING_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
    {
      url: `${MARKETING_URL}/legal/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    },
    {
      url: `${MARKETING_URL}/legal/terms`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    },
  ];

  // Blog pages on meetjovie.com
  const blogPages = blogSlugs.map(slug => ({
    url: `${MARKETING_URL}/blog/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [...marketingPages, ...blogPages];
}
