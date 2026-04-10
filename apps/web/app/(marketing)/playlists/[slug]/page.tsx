import { desc, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MarketingContainer } from '@/components/marketing';
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

  if (!playlist || playlist.status !== 'published') return null;
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
}: {
  params: Promise<{ slug: string }>;
}) {
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

      <MarketingContainer width='prose' className='py-12'>
        <div className='mx-auto flex flex-col items-center'>
          {/* Cover Art */}
          {playlist.coverImageUrl && (
            <div className='aspect-square w-[300px] overflow-hidden rounded-lg shadow-2xl'>
              <Image
                src={playlist.coverImageUrl}
                alt={playlist.title}
                className='h-full w-full object-cover'
                width={300}
                height={300}
                unoptimized
              />
            </div>
          )}

          {/* Title & Attribution */}
          <h1 className='mt-6 text-center text-[24px] font-[510] leading-[1.2] tracking-[-0.48px] text-white'>
            {playlist.title}
          </h1>
          <p className='mt-1 text-[13px] font-[450] text-white/40'>
            Curated by{' '}
            <Link href='/' className='text-white/60 hover:text-white'>
              Jovie
            </Link>
          </p>

          {/* Description */}
          {playlist.description && (
            <p className='mt-4 text-center text-[15px] font-[400] leading-[1.6] text-white/60'>
              {playlist.description}
            </p>
          )}

          {/* Open in Spotify CTA */}
          {spotifyUrl && (
            <a
              href={spotifyUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#1DB954] px-6 py-3 text-[15px] font-[510] text-white transition-opacity hover:opacity-90'
            >
              <svg
                className='h-5 w-5'
                viewBox='0 0 24 24'
                fill='currentColor'
                aria-hidden='true'
                role='img'
              >
                <title>Spotify</title>
                <path d='M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z' />
              </svg>
              Open in Spotify
            </a>
          )}

          {/* Tracklist */}
          <div className='mt-8 w-full'>
            <h2 className='sr-only'>Tracklist</h2>
            <ol className='divide-y divide-white/[0.06]'>
              {tracks.map(track => (
                <li key={track.id} className='flex items-center gap-3 py-3'>
                  {/* Track number (hidden on mobile per design review) */}
                  <span className='hidden w-6 text-right text-[13px] font-[450] text-white/20 md:block'>
                    {track.position}
                  </span>

                  {/* Track info */}
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-[15px] font-[450] text-white'>
                      {track.trackName}
                    </p>
                    {track.username ? (
                      <Link
                        href={`/${track.username}`}
                        className='truncate text-[13px] font-[450] text-white/50 hover:text-white/80'
                      >
                        {track.artistName}
                      </Link>
                    ) : (
                      <p className='truncate text-[13px] font-[450] text-white/50'>
                        {track.artistName}
                      </p>
                    )}
                  </div>

                  {/* Spotify deep link per track */}
                  {track.spotifyTrackId && spotifyUrl && (
                    <a
                      href={`https://open.spotify.com/track/${track.spotifyTrackId}`}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='flex-shrink-0 p-2 text-white/20 hover:text-[#1DB954]'
                      aria-label={`Play ${track.trackName} on Spotify`}
                    >
                      <span className='sr-only'>
                        Play {track.trackName} on Spotify
                      </span>
                      <svg
                        className='h-4 w-4'
                        viewBox='0 0 24 24'
                        fill='currentColor'
                        aria-hidden='true'
                      >
                        <path d='M8 5v14l11-7z' />
                      </svg>
                    </a>
                  )}
                </li>
              ))}
            </ol>
          </div>

          {/* Footer */}
          <div className='mt-12 text-center'>
            <Link
              href='/playlists'
              className='text-[13px] font-[450] text-white/40 hover:text-white/60'
            >
              Discover more playlists
            </Link>
          </div>
        </div>
      </MarketingContainer>
    </>
  );
}
