import { eq } from 'drizzle-orm';
import { MetadataRoute } from 'next';
import { PRIMARY_URL } from '@/constants/domains';
import { getBlogPostSlugs } from '@/lib/blog/getBlogPosts';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';

/**
 * Single-domain sitemap for jov.ie
 * Includes all pages: marketing, blog, and creator profiles
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const blogSlugs = await getBlogPostSlugs();

  // Marketing pages
  const marketingPages: MetadataRoute.Sitemap = [
    {
      url: PRIMARY_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${PRIMARY_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${PRIMARY_URL}/legal/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${PRIMARY_URL}/legal/terms`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];

  // Blog pages
  const blogPages: MetadataRoute.Sitemap = blogSlugs.map(slug => ({
    url: `${PRIMARY_URL}/blog/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  // Creator profiles (skip during build if no DB)
  let profilePages: MetadataRoute.Sitemap = [];

  if (
    process.env.NEXT_PHASE !== 'phase-production-build' &&
    process.env.DATABASE_URL
  ) {
    try {
      const profiles = await db
        .select({
          username: creatorProfiles.username,
          updatedAt: creatorProfiles.updatedAt,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.isPublic, true));

      profilePages = profiles.map(profile => ({
        url: `${PRIMARY_URL}/${profile.username}`,
        lastModified: profile.updatedAt || new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));
    } catch (error) {
      console.error('Error fetching profiles for sitemap:', error);
    }
  }

  return [...marketingPages, ...blogPages, ...profilePages];
}
