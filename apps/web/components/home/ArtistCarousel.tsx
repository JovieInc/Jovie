'use client';

import Link from 'next/link';
import { OptimizedImage } from '@/components/molecules/OptimizedImage';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

interface Artist {
  id: string;
  handle: string;
  name: string;
  image_url: string | null;
  tagline: string | null;
}

interface ArtistCarouselProps {
  readonly artists: Artist[];
}

export function ArtistCarousel({ artists }: ArtistCarouselProps) {
  const prefersReducedMotion = useReducedMotion();

  if (!artists || artists.length === 0) {
    return null;
  }

  return (
    <section className='relative w-full max-w-full overflow-hidden bg-linear-to-r from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-950 dark:via-purple-950 dark:to-pink-950 py-16'>
      {/* Full-width horizontal scroll container */}
      <div className='relative w-full overflow-x-auto overflow-y-hidden'>
        {/* Artist images row */}
        <div className='flex space-x-6 px-4 sm:px-6 lg:px-8 py-8 min-w-max'>
          {artists.map(artist => (
            <Link
              key={artist.id}
              href={`/${artist.handle}`}
              className={`group shrink-0 ${prefersReducedMotion ? '' : 'transition-transform duration-300 hover:scale-110'}`}
            >
              <div className='relative'>
                {/* Artist image */}
                <div className='h-24 w-24 sm:h-32 sm:w-32'>
                  <OptimizedImage
                    src={artist.image_url}
                    alt={`${artist.name} - Music Artist`}
                    size='2xl'
                    shape='circle'
                    className='w-full h-full object-cover'
                    aspectRatio='square'
                    sizes='(max-width: 640px) 96px, (max-width: 1024px) 128px, 128px'
                  />
                </div>

                {/* Hover overlay with artist name */}
                <div
                  className={`absolute inset-0 flex items-center justify-center bg-black/50 rounded-full ${
                    prefersReducedMotion
                      ? 'opacity-0 focus-visible-within:opacity-100 group-focus-visible:opacity-100'
                      : 'opacity-0 group-hover:opacity-100 transition-opacity duration-300'
                  }`}
                >
                  <span className='text-white text-xs sm:text-sm font-medium text-center px-2'>
                    {artist.name}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
