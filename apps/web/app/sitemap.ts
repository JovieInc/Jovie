import { eq } from 'drizzle-orm';
import { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { BASE_URL } from '@/constants/app';
import { HOSTNAME } from '@/constants/domains';
import { getBlogPostSlugs } from '@/lib/blog/getBlogPosts';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';
import { env } from '@/lib/env-server';

/**
 * Sitemap configuration for jov.ie
 *
 * Includes both profile pages and marketing pages (blog, legal, homepage)
 * since everything is now served from the unified jov.ie domain.
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
 * Sitemap for jov.ie - only profile pages
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

  return [homePage, ...profilePages];
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
