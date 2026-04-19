import { desc, eq } from 'drizzle-orm';
import { Play } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { PublicShareMenu } from '@/components/features/share/PublicShareMenu';
import { MarketingContainer } from '@/components/marketing';
import { BASE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { joviePlaylists, joviePlaylistTracks } from '@/lib/db/schema/playlists';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { buildPlaylistShareContext } from '@/lib/share/context';
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
  const shareContext = buildPlaylistShareContext({
    slug,
    title: playlist.title,
    coverImageUrl: playlist.coverImageUrl,
    editorialNote: playlist.editorialNote ?? playlist.description,
  });

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
          <div className='mt-3'>
            <PublicShareMenu
              context={shareContext}
              title='Share'
              align='center'
              trigger={
                <button
                  type='button'
                  className='text-[13px] font-[450] text-white/50 transition-colors hover:text-white/80'
                >
                  Share
                </button>
              }
            />
          </div>

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
              <SocialIcon platform='spotify' className='h-5 w-5' aria-hidden />
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
                      <Play className='h-4 w-4' aria-hidden='true' />
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
              Discover More Playlists
            </Link>
          </div>
        </div>
      </MarketingContainer>
    </>
  );
}
