import { eq } from 'drizzle-orm';
import type { MetadataRoute } from 'next';
import { MARKETING_URL, PROFILE_URL } from '@/constants/app';
import { getBlogPostSlugs } from '@/lib/blog/getBlogPosts';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';

// Multi-domain sitemap configuration:
// - Marketing pages (blog, legal, etc.) use MARKETING_URL (meetjovie.com)
// - Profile pages use PROFILE_URL (jov.ie)

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return buildStaticPagesOnly();
  }

  let profiles: Array<{ username: string; updatedAt: Date | null }> = [];

  try {
    if (!process.env.DATABASE_URL) {
      // Skip DB lookup during builds without database access
      return buildStaticPagesOnly();
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
    // Continue with empty profiles array on error
  }

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

  // Creator profile pages on jov.ie (canonical profile domain)
  const profilePages = profiles.map(profile => ({
    url: `${PROFILE_URL}/${profile.username}`,
    lastModified: profile.updatedAt || new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [...marketingPages, ...blogPages, ...profilePages];
}

async function buildStaticPagesOnly(): Promise<MetadataRoute.Sitemap> {
  const blogSlugs = await getBlogPostSlugs();
  return [
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
    ...blogSlugs.map(slug => ({
      url: `${MARKETING_URL}/blog/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
