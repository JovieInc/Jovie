import 'server-only';

import { and, desc, eq, isNull } from 'drizzle-orm';
import { getBlogPosts } from '@/lib/blog/getBlogPosts';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { joviePlaylists } from '@/lib/db/schema/playlists';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  getProfileByUsername,
  getTopProfilesForStaticGeneration,
} from '@/lib/services/profile';
import {
  buildBlogShareContext,
  buildPlaylistShareContext,
  buildProfileShareContext,
  buildReleaseShareContext,
} from '@/lib/share/context';
import type { ShareContext } from '@/lib/share/types';

export type ShareStudioSearchParams = Record<
  string,
  string | string[] | undefined
>;

type BlogPost = Awaited<ReturnType<typeof getBlogPosts>>[number];

interface ProfileSample {
  readonly username: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly bio: string | null;
}

interface ReleaseSample {
  readonly username: string;
  readonly artistName: string;
  readonly slug: string;
  readonly title: string;
  readonly artworkUrl: string | null;
}

interface PlaylistSample {
  readonly slug: string;
  readonly title: string;
  readonly coverImageUrl: string | null;
  readonly editorialNote: string | null;
}

export interface SamplePickerItem {
  readonly key: string;
  readonly label: string;
}

export interface ShareStudioData {
  readonly urlSearchParams: URLSearchParams;
  readonly blogItems: readonly SamplePickerItem[];
  readonly profileItems: readonly SamplePickerItem[];
  readonly releaseItems: readonly SamplePickerItem[];
  readonly playlistItems: readonly SamplePickerItem[];
  readonly selectedBlogKey: string;
  readonly selectedProfileKey: string;
  readonly selectedReleaseKey: string;
  readonly selectedPlaylistKey: string;
  readonly blogContext: ShareContext;
  readonly profileContext: ShareContext;
  readonly releaseContext: ShareContext;
  readonly playlistContext: ShareContext;
}

export function getShareStudioParamValue(
  value: string | string[] | undefined
): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return null;
}

function buildUrlSearchParams(params: ShareStudioSearchParams) {
  const urlSearchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    const normalizedValue = getShareStudioParamValue(value);
    if (normalizedValue) {
      urlSearchParams.set(key, normalizedValue);
    }
  }

  return urlSearchParams;
}

async function getProfileSamples(limit = 4): Promise<ProfileSample[]> {
  const usernames = await getTopProfilesForStaticGeneration(limit);
  const profiles = await Promise.all(
    usernames.map(async entry => getProfileByUsername(entry.username))
  );

  return profiles
    .filter((profile): profile is NonNullable<typeof profile> =>
      Boolean(profile?.usernameNormalized && profile.isPublic)
    )
    .map(profile => ({
      username: profile.usernameNormalized,
      name: profile.displayName ?? profile.username,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
    }));
}

async function getReleaseSamples(limit = 4): Promise<ReleaseSample[]> {
  return db
    .select({
      username: creatorProfiles.usernameNormalized,
      artistName: creatorProfiles.displayName,
      fallbackArtistName: creatorProfiles.username,
      slug: discogReleases.slug,
      title: discogReleases.title,
      artworkUrl: discogReleases.artworkUrl,
    })
    .from(discogReleases)
    .innerJoin(
      creatorProfiles,
      eq(discogReleases.creatorProfileId, creatorProfiles.id)
    )
    .where(
      and(eq(creatorProfiles.isPublic, true), isNull(discogReleases.deletedAt))
    )
    .orderBy(desc(discogReleases.releaseDate), desc(discogReleases.createdAt))
    .limit(limit)
    .then(rows =>
      rows.map(row => ({
        username: row.username,
        artistName: row.artistName ?? row.fallbackArtistName,
        slug: row.slug,
        title: row.title,
        artworkUrl: row.artworkUrl,
      }))
    );
}

async function getPlaylistSamples(limit = 4): Promise<PlaylistSample[]> {
  return db
    .select({
      slug: joviePlaylists.slug,
      title: joviePlaylists.title,
      coverImageUrl: joviePlaylists.coverImageUrl,
      editorialNote: joviePlaylists.editorialNote,
    })
    .from(joviePlaylists)
    .where(eq(joviePlaylists.status, 'published'))
    .orderBy(desc(joviePlaylists.publishedAt), desc(joviePlaylists.createdAt))
    .limit(limit);
}

function selectBlogSample(
  blogPosts: readonly BlogPost[],
  params: ShareStudioSearchParams
) {
  return (
    blogPosts.find(
      post => post.slug === getShareStudioParamValue(params.blog)
    ) ?? blogPosts[0]
  );
}

function selectProfileSample(
  profileSamples: readonly ProfileSample[],
  params: ShareStudioSearchParams
) {
  return (
    profileSamples.find(
      profile => profile.username === getShareStudioParamValue(params.profile)
    ) ?? profileSamples[0]
  );
}

function selectReleaseSample(
  releaseSamples: readonly ReleaseSample[],
  params: ShareStudioSearchParams
) {
  return (
    releaseSamples.find(
      release =>
        `${release.username}:${release.slug}` ===
        getShareStudioParamValue(params.release)
    ) ?? releaseSamples[0]
  );
}

function selectPlaylistSample(
  playlistSamples: readonly PlaylistSample[],
  params: ShareStudioSearchParams
) {
  return (
    playlistSamples.find(
      playlist => playlist.slug === getShareStudioParamValue(params.playlist)
    ) ?? playlistSamples[0]
  );
}

export async function loadShareStudioData(
  params: ShareStudioSearchParams
): Promise<ShareStudioData | null> {
  const [blogPosts, profileSamples, releaseSamples, playlistSamples] =
    await Promise.all([
      getBlogPosts(),
      getProfileSamples(),
      getReleaseSamples(),
      getPlaylistSamples(),
    ]);

  const selectedBlog = selectBlogSample(blogPosts, params);
  const selectedProfile = selectProfileSample(profileSamples, params);
  const selectedRelease = selectReleaseSample(releaseSamples, params);
  const selectedPlaylist = selectPlaylistSample(playlistSamples, params);

  if (
    !selectedBlog ||
    !selectedProfile ||
    !selectedRelease ||
    !selectedPlaylist
  ) {
    return null;
  }

  const selectedReleaseKey = `${selectedRelease.username}:${selectedRelease.slug}`;

  return {
    urlSearchParams: buildUrlSearchParams(params),
    blogItems: blogPosts.slice(0, 4).map(post => ({
      key: post.slug,
      label: post.title,
    })),
    profileItems: profileSamples.map(profile => ({
      key: profile.username,
      label: profile.name,
    })),
    releaseItems: releaseSamples.map(release => ({
      key: `${release.username}:${release.slug}`,
      label: `${release.artistName} \u2014 ${release.title}`,
    })),
    playlistItems: playlistSamples.map(playlist => ({
      key: playlist.slug,
      label: playlist.title,
    })),
    selectedBlogKey: selectedBlog.slug,
    selectedProfileKey: selectedProfile.username,
    selectedReleaseKey,
    selectedPlaylistKey: selectedPlaylist.slug,
    blogContext: buildBlogShareContext({
      slug: selectedBlog.slug,
      title: selectedBlog.title,
      excerpt: selectedBlog.excerpt,
    }),
    profileContext: buildProfileShareContext({
      username: selectedProfile.username,
      artistName: selectedProfile.name,
      avatarUrl: selectedProfile.avatarUrl,
      bio: selectedProfile.bio,
    }),
    releaseContext: buildReleaseShareContext({
      username: selectedRelease.username,
      slug: selectedRelease.slug,
      title: selectedRelease.title,
      artistName: selectedRelease.artistName,
      artworkUrl: selectedRelease.artworkUrl,
      pathname: `/${selectedRelease.username}/${selectedRelease.slug}`,
    }),
    playlistContext: buildPlaylistShareContext({
      slug: selectedPlaylist.slug,
      title: selectedPlaylist.title,
      coverImageUrl: selectedPlaylist.coverImageUrl,
      editorialNote: selectedPlaylist.editorialNote,
    }),
  };
}
