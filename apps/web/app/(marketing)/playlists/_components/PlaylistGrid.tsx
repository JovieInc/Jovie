import Image from 'next/image';
import Link from 'next/link';

export interface PlaylistCardData {
  slug: string;
  title: string;
  coverImageUrl: string | null;
  trackCount: number;
}

/**
 * Shared playlist grid used by the index, genre hub, and mood hub pages.
 * Cover-art-dominant cards: 80% art, small title, hover scale-up, no chrome.
 */
export function PlaylistGrid({
  playlists,
  emptyMessage,
}: {
  playlists: PlaylistCardData[];
  emptyMessage: React.ReactNode;
}) {
  if (playlists.length === 0) {
    return (
      <div className='mt-16 text-center'>
        <p className='text-[15px] text-white/40'>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className='mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'>
      {playlists.map(playlist => (
        <Link
          key={playlist.slug}
          href={`/playlists/${playlist.slug}`}
          className='group'
        >
          <div className='aspect-square overflow-hidden rounded-md bg-white/5'>
            {playlist.coverImageUrl ? (
              <Image
                src={playlist.coverImageUrl}
                alt={playlist.title}
                className='h-full w-full object-cover transition-transform duration-200 group-hover:scale-105'
                width={400}
                height={400}
                unoptimized
              />
            ) : (
              <div className='flex h-full items-center justify-center text-white/20'>
                <span className='text-[13px]'>No cover</span>
              </div>
            )}
          </div>
          <h2 className='mt-2 text-[13px] font-[450] leading-[1.3] text-white/80 group-hover:text-white'>
            {playlist.title}
          </h2>
          <p className='text-[11px] text-white/40'>
            {playlist.trackCount} tracks
          </p>
        </Link>
      ))}
    </div>
  );
}
