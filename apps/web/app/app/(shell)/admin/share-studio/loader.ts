import 'server-only';

import { and, desc, eq, isNull } from 'drizzle-orm';
import { getBlogPosts } from '@/lib/blog/getBlogPosts';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { joviePlaylists } from '@/lib/db/schema/playlists';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
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

export type ShareStudioType = 'blog' | 'profile' | 'release' | 'playlist';

export interface ShareStudioData {
  readonly urlSearchParams: URLSearchParams;
  readonly items: readonly SamplePickerItem[];
  readonly selectedKey: string;
  readonly context: ShareContext | null;
  readonly state: 'ready' | 'empty' | 'unavailable';
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

/** Each streamed preview reads only its own public catalog. */
export async function loadShareStudioData(
  params: ShareStudioSearchParams,
  type: ShareStudioType
): Promise<ShareStudioData> {
  const urlSearchParams = buildUrlSearchParams(params);
  try {
    const sample = await loadSample(type, params);
    if (sample.context) urlSearchParams.set(type, sample.selectedKey);
    else urlSearchParams.delete(type);
    return {
      ...sample,
      urlSearchParams,
      state: sample.context ? 'ready' : 'empty',
    };
  } catch (error) {
    await captureError('Admin share preview could not be read', error, {
      type,
    });
    return {
      urlSearchParams,
      items: [],
      selectedKey: '',
      context: null,
      state: 'unavailable',
    };
  }
}

async function loadSample(
  type: ShareStudioType,
  params: ShareStudioSearchParams
) {
  switch (type) {
    case 'blog': {
      const samples = await getBlogPosts();
      const selected = selectBlogSample(samples, params);
      return {
        items: samples
          .slice(0, 4)
          .map(post => ({ key: post.slug, label: post.title })),
        selectedKey: selected?.slug ?? '',
        context: selected
          ? buildBlogShareContext({
              slug: selected.slug,
              title: selected.title,
              excerpt: selected.excerpt,
            })
          : null,
      };
    }
    case 'profile': {
      const samples = await getProfileSamples();
      const selected = selectProfileSample(samples, params);
      return {
        items: samples.map(profile => ({
          key: profile.username,
          label: profile.name,
        })),
        selectedKey: selected?.username ?? '',
        context: selected
          ? buildProfileShareContext({
              username: selected.username,
              artistName: selected.name,
              avatarUrl: selected.avatarUrl,
              bio: selected.bio,
            })
          : null,
      };
    }
    case 'release': {
      const samples = await getReleaseSamples();
      const selected = selectReleaseSample(samples, params);
      return {
        items: samples.map(release => ({
          key: `${release.username}:${release.slug}`,
          label: `${release.artistName} — ${release.title}`,
        })),
        selectedKey: selected ? `${selected.username}:${selected.slug}` : '',
        context: selected
          ? buildReleaseShareContext({
              username: selected.username,
              slug: selected.slug,
              title: selected.title,
              artistName: selected.artistName,
              artworkUrl: selected.artworkUrl,
              pathname: `/${selected.username}/${selected.slug}`,
            })
          : null,
      };
    }
    case 'playlist': {
      const samples = await getPlaylistSamples();
      const selected = selectPlaylistSample(samples, params);
      return {
        items: samples.map(playlist => ({
          key: playlist.slug,
          label: playlist.title,
        })),
        selectedKey: selected?.slug ?? '',
        context: selected
          ? buildPlaylistShareContext({
              slug: selected.slug,
              title: selected.title,
              coverImageUrl: selected.coverImageUrl,
              editorialNote: selected.editorialNote,
            })
          : null,
      };
    }
  }
}
