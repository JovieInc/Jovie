import { desc, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PlaylistDetailContent } from '@/components/organisms/PlaylistDetailContent';
import { BASE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { joviePlaylists, joviePlaylistTracks } from '@/lib/db/schema/playlists';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';

export const dynamicParams = false;
export const revalidate = false;

export async function generateStaticParams() {
  try {
    const playlists = await db
      .select({ slug: joviePlaylists.slug })
      .from(joviePlaylists)
      .where(eq(joviePlaylists.status, 'published'))
      .orderBy(desc(joviePlaylists.publishedAt), joviePlaylists.slug);

    return playlists.map(playlist => ({
      slug: playlist.slug,
    }));
  } catch {
    // Build-time DB failures should not block deployment.
    return [];
  }
}

// ============================================================================
// Data Fetching
// ============================================================================

async function getPlaylist(slug: string) {
  const [playlist] = await db
    .select()
    .from(joviePlaylists)
    .where(eq(joviePlaylists.slug, slug))
    .limit(1);

  if (playlist?.status !== 'published') return null;
  return playlist;
}

async function getPlaylistTracks(playlistId: string) {
  return db
    .select({
      id: joviePlaylistTracks.id,
      position: joviePlaylistTracks.position,
      trackName: joviePlaylistTracks.trackName,
      artistName: joviePlaylistTracks.artistName,
      spotifyTrackId: joviePlaylistTracks.spotifyTrackId,
      isJovieArtist: joviePlaylistTracks.isJovieArtist,
      jovieProfileId: joviePlaylistTracks.jovieProfileId,
      username: creatorProfiles.usernameNormalized,
    })
    .from(joviePlaylistTracks)
    .leftJoin(
      creatorProfiles,
      eq(joviePlaylistTracks.jovieProfileId, creatorProfiles.id)
    )
    .where(eq(joviePlaylistTracks.playlistId, playlistId))
    .orderBy(joviePlaylistTracks.position);
}

// ============================================================================
// Metadata
// ============================================================================

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const playlist = await getPlaylist(slug);
  if (!playlist) return { title: 'Playlist Not Found' };

  const url = `${BASE_URL}/playlists/${slug}`;

  return {
    title: `${playlist.title} — Curated Playlist`,
    description: playlist.editorialNote?.slice(0, 160) ?? playlist.description,
    keywords: [
      playlist.title,
      ...(playlist.genreTags ?? []),
      ...(playlist.moodTags ?? []),
      'curated playlist',
      'spotify playlist',
    ],
    alternates: { canonical: url },
    openGraph: {
      title: playlist.title,
      description:
        playlist.editorialNote?.slice(0, 200) ?? playlist.description ?? '',
      url,
      type: 'music.playlist',
      ...(playlist.coverImageUrl
        ? { images: [{ url: playlist.coverImageUrl, width: 640, height: 640 }] }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: playlist.title,
      description:
        playlist.editorialNote?.slice(0, 200) ?? playlist.description ?? '',
      ...(playlist.coverImageUrl ? { images: [playlist.coverImageUrl] } : {}),
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  };
}

// ============================================================================
// Page
// ============================================================================

export default async function PlaylistPage({
  params,
}: Readonly<{
  params: Promise<{ slug: string }>;
}>) {
  const { slug } = await params;
  const playlist = await getPlaylist(slug);
  if (!playlist) notFound();

  const tracks = await getPlaylistTracks(playlist.id);

  const spotifyUrl = playlist.spotifyPlaylistId
    ? `https://open.spotify.com/playlist/${playlist.spotifyPlaylistId}`
    : null;
  // JSON-LD: MusicPlaylist schema
  const playlistJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicPlaylist',
    '@id': `${BASE_URL}/playlists/${slug}#playlist`,
    name: playlist.title,
    description: playlist.editorialNote ?? playlist.description,
    url: `${BASE_URL}/playlists/${slug}`,
    ...(playlist.coverImageUrl
      ? {
          image: {
            '@type': 'ImageObject',
            url: playlist.coverImageUrl,
            width: 640,
            height: 640,
          },
        }
      : {}),
    ...(playlist.publishedAt
      ? { datePublished: playlist.publishedAt.toISOString() }
      : {}),
    dateModified: playlist.updatedAt.toISOString(),
    creator: {
      '@type': 'Organization',
      '@id': `${BASE_URL}#organization`,
      name: 'Jovie',
    },
    numTracks: playlist.trackCount,
    track: tracks.map(t => ({
      '@type': 'MusicRecording',
      name: t.trackName,
      position: t.position,
      byArtist: {
        '@type': 'MusicGroup',
        name: t.artistName,
        ...(t.username ? { url: `${BASE_URL}/${t.username}` } : {}),
      },
    })),
    genre: playlist.genreTags,
    ...(spotifyUrl ? { sameAs: [spotifyUrl] } : {}),
  };

  // JSON-LD: BreadcrumbList
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Playlists',
        item: `${BASE_URL}/playlists`,
      },
      ...(playlist.genreTags?.[0]
        ? [
            {
              '@type': 'ListItem',
              position: 2,
              name: playlist.genreTags[0],
              item: `${BASE_URL}/playlists/genre/${encodeURIComponent(playlist.genreTags[0])}`,
            },
          ]
        : []),
      {
        '@type': 'ListItem',
        position: playlist.genreTags?.[0] ? 3 : 2,
        name: playlist.title,
      },
    ],
  };

  return (
    <>
      <script
        type='application/ld+json'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data, safe-serialized
        dangerouslySetInnerHTML={{
          __html: safeJsonLdStringify(playlistJsonLd),
        }}
      />
      <script
        type='application/ld+json'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data, safe-serialized
        dangerouslySetInnerHTML={{
          __html: safeJsonLdStringify(breadcrumbJsonLd),
        }}
      />

      <PlaylistDetailContent
        playlist={{
          slug,
          title: playlist.title,
          coverImageUrl: playlist.coverImageUrl,
          description: playlist.description,
          shareDescription: playlist.editorialNote ?? playlist.description,
          spotifyPlaylistId: playlist.spotifyPlaylistId,
        }}
        tracks={tracks.map(track => ({
          id: track.id,
          position: track.position,
          trackName: track.trackName,
          artistName: track.artistName,
          spotifyTrackId: track.spotifyTrackId,
          username: track.username,
        }))}
      />
    </>
  );
}
