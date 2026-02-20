import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { MetadataRoute } from 'next';
import { unstable_cache } from 'next/cache';
import { BASE_URL } from '@/constants/app';
import { getBlogPostSlugs } from '@/lib/blog/getBlogPosts';
import { db } from '@/lib/db';
import { discogReleases, discogTracks } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { env } from '@/lib/env-server';

const SITEMAP_CACHE_TTL_SECONDS = 60 * 60;

export const revalidate = SITEMAP_CACHE_TTL_SECONDS;

type SitemapCatalog = {
  profiles: Array<{ username: string; updatedAt: Date | null }>;
  releases: Array<{
    username: string;
    slug: string;
    updatedAt: Date | null;
    artworkUrl: string | null;
  }>;
  tracks: Array<{
    username: string;
    slug: string;
    updatedAt: Date | null;
    artworkUrl: string | null;
  }>;
};

const getSitemapCatalog = unstable_cache(
  async (): Promise<SitemapCatalog> => {
    if (!env.DATABASE_URL) {
      return { profiles: [], releases: [], tracks: [] };
    }

    try {
      const [profiles, releases, tracks] = await Promise.all([
        db
          .select({
            username: creatorProfiles.username,
            updatedAt: creatorProfiles.updatedAt,
          })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.isPublic, true)),

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

      return { profiles, releases, tracks };
    } catch (error) {
      Sentry.captureException(error);
      return { profiles: [], releases: [], tracks: [] };
    }
  },
  ['sitemap-catalog-v1'],
  { revalidate: SITEMAP_CACHE_TTL_SECONDS }
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [catalog, blogSlugs] = await Promise.all([
    getSitemapCatalog(),
    getBlogPostSlugs(),
  ]);

  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/legal/privacy`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/legal/terms`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];

  const blogPages: MetadataRoute.Sitemap = blogSlugs.map(slug => ({
    url: `${BASE_URL}/blog/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  const profilePages: MetadataRoute.Sitemap = catalog.profiles.map(profile => ({
    url: `${BASE_URL}/${profile.username}`,
    lastModified: profile.updatedAt ?? now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const releasePages: MetadataRoute.Sitemap = catalog.releases.map(release => ({
    url: `${BASE_URL}/${release.username}/${release.slug}`,
    lastModified: release.updatedAt ?? now,
    changeFrequency: 'monthly',
    priority: 0.7,
    ...(release.artworkUrl ? { images: [release.artworkUrl] } : {}),
  }));

  const releaseUrls = new Set(releasePages.map(release => release.url));
  const trackPages: MetadataRoute.Sitemap = catalog.tracks
    .filter(
      track => !releaseUrls.has(`${BASE_URL}/${track.username}/${track.slug}`)
    )
    .map(track => ({
      url: `${BASE_URL}/${track.username}/${track.slug}`,
      lastModified: track.updatedAt ?? now,
      changeFrequency: 'monthly',
      priority: 0.6,
      ...(track.artworkUrl ? { images: [track.artworkUrl] } : {}),
    }));

  return [
    ...staticPages,
    ...blogPages,
    ...profilePages,
    ...releasePages,
    ...trackPages,
  ];
}
