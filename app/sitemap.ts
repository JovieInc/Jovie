import { eq } from 'drizzle-orm';
import { MetadataRoute } from 'next';
import { APP_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';

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

  const baseUrl = APP_URL;

  // Static pages with comprehensive metadata
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/legal/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/terms`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    },
  ];

  // Creator profile pages with optimized priorities
  const profilePages = profiles.map(profile => ({
    url: `${baseUrl}/${profile.username}`,
    lastModified: profile.updatedAt || new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [...staticPages, ...profilePages];
}

function buildStaticPagesOnly(): MetadataRoute.Sitemap {
  const baseUrl = APP_URL;
  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/legal/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/terms`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];
}
