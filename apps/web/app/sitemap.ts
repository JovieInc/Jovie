import * as Sentry from '@sentry/nextjs';
import { and, eq } from 'drizzle-orm';
import { MetadataRoute } from 'next';
import { unstable_cache } from 'next/cache';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { getAlternativeSlugs } from '@/content/alternatives';
import { getComparisonSlugs } from '@/content/comparisons';
import { getBlogPosts, slugifyCategory } from '@/lib/blog/getBlogPosts';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { getChangelogReleases } from '@/lib/changelog-source';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
} from '@/lib/db/schema/content';
import { joviePlaylists } from '@/lib/db/schema/playlists';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getPublishedEngineeringStories } from '@/lib/engineering-publication';
import { env } from '@/lib/env-server';
import { filterPublicDiscoveryIdentities } from '@/lib/profile/public-profile-indexing-policy';
import { publicReleaseEligibilitySqlPredicate } from '@/lib/profile/public-release-eligibility';
import { isUnclaimedStructuredCreditProfile } from '@/lib/profile/unclaimed-artist-profile';
import {
  getExactPublishedMarketingPaths,
  isEditorialSitemapPath,
  latestContentRevision,
  SITEMAP_PUBLISHED_LEGAL_PATHS,
  SITEMAP_PUBLISHED_MACHINE_PATHS,
  toContentRevisionDate,
} from '@/lib/seo/sitemap-publication';

export const revalidate = 3600;

type SitemapCatalog = {
  profiles: Array<{
    username: string;
    updatedAt: Date | null;
    avatarUrl: string | null;
    isClaimed: boolean | null;
    displayName: string | null;
    settings: unknown;
    ownerEmail: string | null;
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

const EMPTY_CATALOG: SitemapCatalog = {
  profiles: [],
  releases: [],
  tracks: [],
  playlists: [],
};

const getSitemapCatalog = unstable_cache(
  async (): Promise<SitemapCatalog> => {
    if (!env.DATABASE_URL) {
      return EMPTY_CATALOG;
    }

    try {
      const [profiles, releases, tracks, playlists] = await Promise.all([
        db
          .select({
            username: creatorProfiles.username,
            updatedAt: creatorProfiles.updatedAt,
            avatarUrl: creatorProfiles.avatarUrl,
            isClaimed: creatorProfiles.isClaimed,
            displayName: creatorProfiles.displayName,
            settings: creatorProfiles.settings,
            ownerEmail: users.email,
          })
          .from(creatorProfiles)
          .leftJoin(users, eq(users.id, creatorProfiles.userId))
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
          .where(
            and(
              eq(creatorProfiles.isPublic, true),
              publicReleaseEligibilitySqlPredicate()
            )
          ),

        db
          .select({
            username: creatorProfiles.usernameNormalized,
            slug: discogRecordings.slug,
            updatedAt: discogRecordings.updatedAt,
          })
          .from(discogRecordings)
          .innerJoin(
            discogReleaseTracks,
            eq(discogReleaseTracks.recordingId, discogRecordings.id)
          )
          .innerJoin(
            discogReleases,
            eq(discogReleaseTracks.releaseId, discogReleases.id)
          )
          .innerJoin(
            creatorProfiles,
            eq(discogRecordings.creatorProfileId, creatorProfiles.id)
          )
          .where(
            and(
              eq(creatorProfiles.isPublic, true),
              publicReleaseEligibilitySqlPredicate()
            )
          ),

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

      const discoverableProfiles = filterPublicDiscoveryIdentities(
        profiles.map(profile => ({
          ...profile,
          handle: profile.username,
          isPublic: true,
        }))
      );
      const eligibleUsernames = new Set(
        discoverableProfiles.map(profile =>
          profile.username.trim().toLowerCase()
        )
      );

      return {
        profiles: discoverableProfiles.filter(
          profile =>
            profile.isClaimed === true ||
            !isUnclaimedStructuredCreditProfile(profile.settings)
        ),
        releases: releases.filter(release =>
          eligibleUsernames.has(release.username.trim().toLowerCase())
        ),
        tracks: tracks.filter(track =>
          eligibleUsernames.has(track.username.trim().toLowerCase())
        ),
        playlists,
      };
    } catch (error) {
      Sentry.captureException(error);
      return EMPTY_CATALOG;
    }
  },
  ['sitemap-catalog-v5'],
  { revalidate: 3600, tags: [CACHE_TAGS.SITEMAP_CATALOG] }
);

function absoluteUrl(path: string): string {
  return path === '/' ? BASE_URL : `${BASE_URL}${path}`;
}

function sitemapEntry(
  path: string,
  lastModified?: Date,
  images?: readonly string[]
): MetadataRoute.Sitemap[number] {
  return {
    url: absoluteUrl(path),
    ...(lastModified ? { lastModified } : {}),
    ...(images && images.length > 0 ? { images: [...images] } : {}),
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [catalog, blogPosts, changelogReleases, engineeringStories] =
    await Promise.all([
      getSitemapCatalog(),
      getBlogPosts(),
      getChangelogReleases(),
      getPublishedEngineeringStories(),
    ]);

  const blogLastModified = latestContentRevision(
    ...blogPosts.map(post => post.updatedDate ?? post.date)
  );
  const changelogLastModified = latestContentRevision(
    ...changelogReleases.map(release =>
      release.date ? `${release.date}T00:00:00Z` : undefined
    )
  );
  const engineeringLastModified = latestContentRevision(
    ...engineeringStories.map(story =>
      story.source ? `${story.source.date}T00:00:00Z` : undefined
    )
  );

  const marketingPages: MetadataRoute.Sitemap = [];
  for (const path of getExactPublishedMarketingPaths()) {
    if (isEditorialSitemapPath(path)) continue;
    marketingPages.push(sitemapEntry(path));
  }

  for (const path of SITEMAP_PUBLISHED_LEGAL_PATHS) {
    marketingPages.push(sitemapEntry(path));
  }

  for (const path of SITEMAP_PUBLISHED_MACHINE_PATHS) {
    marketingPages.push(sitemapEntry(path));
  }

  for (const slug of getComparisonSlugs()) {
    marketingPages.push(sitemapEntry(`${APP_ROUTES.COMPARE}/${slug}`));
  }

  for (const slug of getAlternativeSlugs()) {
    marketingPages.push(sitemapEntry(`${APP_ROUTES.ALTERNATIVES}/${slug}`));
  }

  const editorialPages: MetadataRoute.Sitemap = [
    sitemapEntry('/blog', blogLastModified),
    sitemapEntry('/changelog', changelogLastModified),
    sitemapEntry(APP_ROUTES.ENGINEERING, engineeringLastModified),
  ];

  editorialPages.push(
    ...blogPosts.map(post =>
      sitemapEntry(
        `/blog/${post.slug}`,
        toContentRevisionDate(post.updatedDate ?? post.date)
      )
    )
  );

  const blogAuthors = [
    ...new Set(
      blogPosts
        .map(post => post.authorUsername)
        .filter((u): u is string => u != null)
    ),
  ];
  for (const username of blogAuthors) {
    const authorPosts = blogPosts.filter(
      post => post.authorUsername === username
    );
    editorialPages.push(
      sitemapEntry(
        `/blog/authors/${username}`,
        latestContentRevision(
          ...authorPosts.map(post => post.updatedDate ?? post.date)
        )
      )
    );
  }

  const blogCategories = [
    ...new Set(
      blogPosts.map(post => post.category).filter((c): c is string => c != null)
    ),
  ];
  for (const category of blogCategories) {
    const categoryPosts = blogPosts.filter(post => post.category === category);
    editorialPages.push(
      sitemapEntry(
        `/blog/category/${slugifyCategory(category)}`,
        latestContentRevision(
          ...categoryPosts.map(post => post.updatedDate ?? post.date)
        )
      )
    );
  }

  editorialPages.push(
    ...changelogReleases.map(release =>
      sitemapEntry(
        `/changelog/${encodeURIComponent(release.version)}`,
        toContentRevisionDate(
          release.date ? `${release.date}T00:00:00Z` : undefined
        )
      )
    )
  );

  editorialPages.push(
    ...engineeringStories.flatMap(story =>
      story.source
        ? [
            sitemapEntry(
              `${APP_ROUTES.ENGINEERING}/${story.slug}`,
              toContentRevisionDate(`${story.source.date}T00:00:00Z`)
            ),
          ]
        : []
    )
  );

  const profilePages: MetadataRoute.Sitemap = catalog.profiles.map(profile =>
    sitemapEntry(
      `/${profile.username}`,
      toContentRevisionDate(profile.updatedAt),
      profile.avatarUrl ? [profile.avatarUrl] : undefined
    )
  );

  const releasePages: MetadataRoute.Sitemap = catalog.releases.map(release =>
    sitemapEntry(
      `/${release.username}/${release.slug}`,
      toContentRevisionDate(release.updatedAt),
      release.artworkUrl ? [release.artworkUrl] : undefined
    )
  );

  const releaseUrls = new Set(releasePages.map(release => release.url));
  const trackPages: MetadataRoute.Sitemap = catalog.tracks
    .filter(
      track => !releaseUrls.has(absoluteUrl(`/${track.username}/${track.slug}`))
    )
    .map(track =>
      sitemapEntry(
        `/${track.username}/${track.slug}`,
        toContentRevisionDate(track.updatedAt)
      )
    );

  const playlistPages: MetadataRoute.Sitemap = catalog.playlists.map(playlist =>
    sitemapEntry(
      `/playlists/${playlist.slug}`,
      toContentRevisionDate(playlist.updatedAt),
      playlist.coverImageUrl ? [playlist.coverImageUrl] : undefined
    )
  );

  return [
    ...marketingPages,
    ...editorialPages,
    ...profilePages,
    ...releasePages,
    ...trackPages,
    ...playlistPages,
  ];
}
