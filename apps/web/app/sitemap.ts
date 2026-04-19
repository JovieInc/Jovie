import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { MetadataRoute } from 'next';
import { unstable_cache } from 'next/cache';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { getAlternativeSlugs } from '@/content/alternatives';
import { getComparisonSlugs } from '@/content/comparisons';
import { getBlogPosts, slugifyCategory } from '@/lib/blog/getBlogPosts';
import { db } from '@/lib/db';
import { discogRecordings, discogReleases } from '@/lib/db/schema/content';
import { joviePlaylists } from '@/lib/db/schema/playlists';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { env } from '@/lib/env-server';

export const revalidate = 3600;

type SitemapCatalog = {
  profiles: Array<{
    username: string;
    updatedAt: Date | null;
    avatarUrl: string | null;
  }>;
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
  }>;
  playlists: Array<{
    slug: string;
    updatedAt: Date | null;
    coverImageUrl: string | null;
  }>;
};

const getSitemapCatalog = unstable_cache(
  async (): Promise<SitemapCatalog> => {
    if (!env.DATABASE_URL) {
      return { profiles: [], releases: [], tracks: [], playlists: [] };
    }

    try {
      const [profiles, releases, tracks, playlists] = await Promise.all([
        db
          .select({
            username: creatorProfiles.username,
            updatedAt: creatorProfiles.updatedAt,
            avatarUrl: creatorProfiles.avatarUrl,
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
            slug: discogRecordings.slug,
            updatedAt: discogRecordings.updatedAt,
          })
          .from(discogRecordings)
          .innerJoin(
            creatorProfiles,
            eq(discogRecordings.creatorProfileId, creatorProfiles.id)
          )
          .where(eq(creatorProfiles.isPublic, true)),

        db
          .select({
            slug: joviePlaylists.slug,
            updatedAt: joviePlaylists.updatedAt,
            coverImageUrl: joviePlaylists.coverImageUrl,
          })
          .from(joviePlaylists)
          .where(eq(joviePlaylists.status, 'published'))
          .catch(
            () =>
              [] as {
                slug: string;
                updatedAt: Date | null;
                coverImageUrl: string | null;
              }[]
          ),
      ]);

      return { profiles, releases, tracks, playlists };
    } catch (error) {
      Sentry.captureException(error);
      return { profiles: [], releases: [], tracks: [], playlists: [] };
    }
  },
  ['sitemap-catalog-v1'],
  { revalidate: 3600 }
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [catalog, blogPosts] = await Promise.all([
    getSitemapCatalog(),
    getBlogPosts(),
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
      url: `${BASE_URL}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/pricing`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/support`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}${APP_ROUTES.PAY}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/changelog`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.5,
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

  const blogPages: MetadataRoute.Sitemap = blogPosts.map(post => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.updatedDate ?? post.date),
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  // Blog author pages
  const blogAuthors = [
    ...new Set(
      blogPosts.map(p => p.authorUsername).filter((u): u is string => u != null)
    ),
  ];
  const blogAuthorPages: MetadataRoute.Sitemap = blogAuthors.map(username => {
    const authorPosts = blogPosts.filter(p => p.authorUsername === username);
    const latestDate =
      authorPosts.length > 0
        ? new Date(
            Math.max(
              ...authorPosts.map(p =>
                new Date(p.updatedDate ?? p.date).getTime()
              )
            )
          )
        : now;
    return {
      url: `${BASE_URL}/blog/authors/${username}`,
      lastModified: latestDate,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    };
  });

  // Blog category pages
  const blogCategories = [
    ...new Set(
      blogPosts.map(p => p.category).filter((c): c is string => c != null)
    ),
  ];
  const blogCategoryPages: MetadataRoute.Sitemap = blogCategories.map(
    category => {
      const catPosts = blogPosts.filter(p => p.category === category);
      const latestDate =
        catPosts.length > 0
          ? new Date(
              Math.max(
                ...catPosts.map(p =>
                  new Date(p.updatedDate ?? p.date).getTime()
                )
              )
            )
          : now;
      return {
        url: `${BASE_URL}/blog/category/${slugifyCategory(category)}`,
        lastModified: latestDate,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      };
    }
  );

  const comparisonPages: MetadataRoute.Sitemap = getComparisonSlugs().map(
    slug => ({
      url: `${BASE_URL}/compare/${slug}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    })
  );

  const alternativePages: MetadataRoute.Sitemap = getAlternativeSlugs().map(
    slug => ({
      url: `${BASE_URL}/alternatives/${slug}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    })
  );

  const profilePages: MetadataRoute.Sitemap = catalog.profiles.map(profile => ({
    url: `${BASE_URL}/${profile.username}`,
    lastModified: profile.updatedAt ?? now,
    changeFrequency: 'weekly',
    priority: 0.8,
    ...(profile.avatarUrl ? { images: [profile.avatarUrl] } : {}),
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
    }));

  const playlistPages: MetadataRoute.Sitemap = catalog.playlists.map(
    playlist => ({
      url: `${BASE_URL}/playlists/${playlist.slug}`,
      lastModified: playlist.updatedAt ?? now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
      ...(playlist.coverImageUrl ? { images: [playlist.coverImageUrl] } : {}),
    })
  );

  return [
    ...staticPages,
    ...blogPages,
    ...blogAuthorPages,
    ...blogCategoryPages,
    ...comparisonPages,
    ...alternativePages,
    ...profilePages,
    ...releasePages,
    ...trackPages,
    ...playlistPages,
  ];
}
