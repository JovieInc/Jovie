import { BASE_URL } from '@/constants/app';
import { type UTMContext } from '@/lib/utm';
import {
  buildDisplayUrl,
  buildEmailBody,
  buildEmailSubject,
  buildPreparedShareText,
  buildStoryAssetFileName,
  slugifyShareValue,
} from './copy';
import type { ShareContext } from './types';

function createAsset(url: string, fileName: string): ShareContext['asset'] {
  return {
    kind: 'story',
    url,
    fileName,
    mimeType: 'image/png',
    width: 1080,
    height: 1920,
  };
}

function createContext(params: {
  readonly surfaceType: ShareContext['surfaceType'];
  readonly title: string;
  readonly canonicalPath: string;
  readonly imageUrl: string | null;
  readonly description?: string;
  readonly artistName?: string;
  readonly assetUrl: string;
  readonly assetSlug: string;
  readonly utmContext: UTMContext;
}): ShareContext {
  const canonicalUrl = `${BASE_URL}${params.canonicalPath}`;
  const preparedText = buildPreparedShareText({
    surfaceType: params.surfaceType,
    title: params.title,
    artistName: params.artistName,
  });
  const emailSubject = buildEmailSubject({
    surfaceType: params.surfaceType,
    title: params.title,
    artistName: params.artistName,
  });

  return {
    surfaceType: params.surfaceType,
    title: params.title,
    canonicalUrl,
    displayUrl: buildDisplayUrl(params.canonicalPath),
    imageUrl: params.imageUrl,
    description: params.description,
    artistName: params.artistName,
    preparedText,
    emailSubject,
    emailBody: buildEmailBody({
      preparedText,
      canonicalUrl,
      description: params.description,
    }),
    asset: createAsset(
      params.assetUrl,
      buildStoryAssetFileName({
        surfaceType: params.surfaceType,
        slug: params.assetSlug,
      })
    ),
    utmContext: params.utmContext,
  };
}

export function buildBlogShareContext(params: {
  readonly slug: string;
  readonly title: string;
  readonly excerpt?: string;
}): ShareContext {
  const canonicalPath = `/blog/${params.slug}`;
  return createContext({
    surfaceType: 'blog',
    title: params.title,
    canonicalPath,
    imageUrl: null,
    description: params.excerpt,
    assetUrl: `${BASE_URL}/api/share/story/blog?slug=${encodeURIComponent(params.slug)}`,
    assetSlug: params.slug,
    utmContext: {
      baseUrl: `${BASE_URL}${canonicalPath}`,
      releaseSlug: params.slug,
      releaseTitle: params.title,
    },
  });
}

export function buildProfileShareContext(params: {
  readonly username: string;
  readonly artistName: string;
  readonly avatarUrl: string | null;
  readonly bio?: string | null;
}): ShareContext {
  const normalizedUsername = params.username.toLowerCase();
  const canonicalPath = `/${normalizedUsername}`;
  return createContext({
    surfaceType: 'profile',
    title: params.artistName,
    canonicalPath,
    imageUrl: params.avatarUrl,
    description: params.bio ?? undefined,
    artistName: params.artistName,
    assetUrl: `${BASE_URL}/api/share/story/profile?username=${encodeURIComponent(normalizedUsername)}`,
    assetSlug: normalizedUsername,
    utmContext: {
      baseUrl: `${BASE_URL}${canonicalPath}`,
      releaseSlug: normalizedUsername,
      releaseTitle: params.artistName,
      artistName: params.artistName,
    },
  });
}

export function buildReleaseShareContext(params: {
  readonly username: string;
  readonly slug: string;
  readonly title: string;
  readonly artistName: string;
  readonly artworkUrl: string | null;
  readonly pathname?: string;
  readonly storyQueryParams?: Record<string, string | null | undefined>;
}): ShareContext {
  const normalizedUsername = params.username.toLowerCase();
  const canonicalPath =
    params.pathname ?? `/${normalizedUsername}/${params.slug}`;
  const storySearchParams = new URLSearchParams();

  for (const [key, value] of Object.entries({
    username: normalizedUsername,
    slug: params.slug,
    ...params.storyQueryParams,
  })) {
    if (typeof value === 'string' && value.length > 0) {
      storySearchParams.set(key, value);
    }
  }

  return createContext({
    surfaceType: 'release',
    title: params.title,
    canonicalPath,
    imageUrl: params.artworkUrl,
    artistName: params.artistName,
    assetUrl: `${BASE_URL}/api/share/story/release?${storySearchParams.toString()}`,
    assetSlug: `${normalizedUsername}-${params.slug}`,
    utmContext: {
      baseUrl: `${BASE_URL}${canonicalPath}`,
      releaseSlug: params.slug,
      releaseTitle: params.title,
      artistName: params.artistName,
    },
  });
}

export function buildPlaylistShareContext(params: {
  readonly slug: string;
  readonly title: string;
  readonly coverImageUrl: string | null;
  readonly editorialNote?: string | null;
}): ShareContext {
  const canonicalPath = `/playlists/${params.slug}`;
  return createContext({
    surfaceType: 'playlist',
    title: params.title,
    canonicalPath,
    imageUrl: params.coverImageUrl,
    description: params.editorialNote ?? undefined,
    assetUrl: `${BASE_URL}/api/share/story/playlist?slug=${encodeURIComponent(params.slug)}`,
    assetSlug: slugifyShareValue(params.slug),
    utmContext: {
      baseUrl: `${BASE_URL}${canonicalPath}`,
      releaseSlug: params.slug,
      releaseTitle: params.title,
    },
  });
}
