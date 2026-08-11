import { Play } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { PublicShareMenu } from '@/components/features/share/PublicShareMenu';
import { MarketingContainer } from '@/components/marketing';
import { buildPlaylistShareContext } from '@/lib/share/context';

export interface PlaylistDetailData {
  readonly slug: string;
  readonly title: string;
  readonly coverImageUrl: string | null;
  readonly description: string | null;
  readonly shareDescription: string | null;
  readonly spotifyPlaylistId: string | null;
}

export interface PlaylistDetailTrack {
  readonly id: string;
  readonly position: number;
  readonly trackName: string;
  readonly artistName: string;
  readonly spotifyTrackId: string | null;
  readonly username: string | null;
}

export interface PlaylistDetailContentProps {
  readonly playlist: PlaylistDetailData;
  readonly tracks: readonly PlaylistDetailTrack[];
}

/**
 * Canonical production presentation for a published Jovie playlist.
 *
 * The route owns params, persistence, cache policy, metadata, structured data,
 * and not-found handling. This body accepts only serializable public fields so
 * the exact shipped UI can also be rendered deterministically in Storybook.
 */
export function PlaylistDetailContent({
  playlist,
  tracks,
}: PlaylistDetailContentProps) {
  const spotifyUrl = playlist.spotifyPlaylistId
    ? `https://open.spotify.com/playlist/${playlist.spotifyPlaylistId}`
    : null;
  const shareContext = buildPlaylistShareContext({
    slug: playlist.slug,
    title: playlist.title,
    coverImageUrl: playlist.coverImageUrl,
    editorialNote: playlist.shareDescription,
  });

  return (
    <MarketingContainer width='prose' className='py-12'>
      <div className='mx-auto flex flex-col items-center'>
        {playlist.coverImageUrl && (
          <div className='aspect-square w-75 overflow-hidden rounded-lg shadow-2xl'>
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

        <h1 className='mt-6 text-center text-2xl font-[510] leading-[1.2] tracking-[-0.48px] text-white dark:text-white'>
          {playlist.title}
        </h1>
        <p className='mt-1 text-app font-[450] text-white/40'>
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
                className='text-app font-[450] text-white/50 transition-colors hover:text-white/80'
              >
                Share
              </button>
            }
          />
        </div>

        {playlist.description && (
          <p className='mt-4 text-center text-mid font-[400] leading-[1.6] text-white/60'>
            {playlist.description}
          </p>
        )}

        {spotifyUrl && (
          <a
            href={spotifyUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-white dark:bg-surface-1 px-6 py-3 text-mid font-[510] text-black dark:text-white transition-colors hover:bg-white dark:bg-surface-1/90'
          >
            <SocialIcon
              platform='spotify'
              className='h-5 w-5 text-brand-spotify'
              aria-hidden
            />
            Open in Spotify
          </a>
        )}

        <div className='mt-8 w-full'>
          <h2 className='sr-only'>Tracklist</h2>
          <ol className='divide-y divide-white/[0.06]'>
            {tracks.map(track => (
              <li key={track.id} className='flex items-center gap-3 py-3'>
                <span className='hidden w-6 text-right text-app font-[450] text-white/20 md:block'>
                  {track.position}
                </span>

                <div className='min-w-0 flex-1'>
                  <p className='truncate text-mid font-[450] text-white dark:text-white'>
                    {track.trackName}
                  </p>
                  {track.username ? (
                    <Link
                      href={`/${track.username}`}
                      className='truncate text-app font-[450] text-white/50 hover:text-white/80'
                    >
                      {track.artistName}
                    </Link>
                  ) : (
                    <p className='truncate text-app font-[450] text-white/50'>
                      {track.artistName}
                    </p>
                  )}
                </div>

                {track.spotifyTrackId && spotifyUrl && (
                  <a
                    href={`https://open.spotify.com/track/${track.spotifyTrackId}`}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='flex-shrink-0 p-2 text-white/20 hover:text-brand-spotify'
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

        <div className='mt-12 text-center'>
          <Link
            href='/playlists'
            className='text-app font-[450] text-white/40 hover:text-white/60'
          >
            Discover More Playlists
          </Link>
        </div>
      </div>
    </MarketingContainer>
  );
}
