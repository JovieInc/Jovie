import Image from 'next/image';
import Link from 'next/link';
import { type FeaturedCreator } from '@/components/organisms/FeaturedArtistsSection';
import { Container } from '@/components/site/Container';
import { getFeaturedCreators } from '@/lib/featured-creators';

export async function NewFeaturedArtists() {
  let artists: FeaturedCreator[] = [];
  let error: string | null = null;

  try {
    artists = await getFeaturedCreators();
  } catch (err) {
    console.error('Error fetching artists:', err);
    error = "We're having trouble loading creators right now. Please refresh.";
  }

  if (!artists.length && !error) {
    return null;
  }

  return (
    <section className='relative pt-0 pb-12'>
      {/* Gradient blend from hero to this section */}
      <div className='absolute inset-0 -z-10 bg-linear-to-b from-white via-white to-neutral-50 dark:from-[#0a0a0b] dark:via-[#0a0a0b] dark:to-[#0f0f11]' />
      <Container>
        {error ? (
          <div className='flex items-center justify-center py-6'>
            <p className='text-sm text-neutral-500 dark:text-neutral-400'>
              {error}
            </p>
          </div>
        ) : (
          /* Artist grid - centered, clean layout */
          <div className='flex flex-wrap items-center justify-center gap-6 sm:gap-8'>
            {artists.slice(0, 6).map(creator => (
              <Link
                key={creator.id}
                href={`/${creator.handle}`}
                className='group flex flex-col items-center gap-3'
              >
                <div className='relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-neutral-200 dark:border-neutral-800 group-hover:border-neutral-400 dark:group-hover:border-neutral-600 transition-colors'>
                  <Image
                    src={creator.src}
                    alt={creator.alt || creator.name}
                    fill
                    className='object-cover'
                  />
                </div>
                <span className='text-xs sm:text-sm font-medium text-neutral-600 dark:text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors'>
                  {creator.name}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
