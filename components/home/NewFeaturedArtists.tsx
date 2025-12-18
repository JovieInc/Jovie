import { type FeaturedCreator } from '@/components/organisms/FeaturedArtistsSection';
import { Container } from '@/components/site/Container';
import { getFeaturedCreators } from '@/lib/featured-creators';
import { FeaturedArtistsDriftRow } from './FeaturedArtistsDriftRow';

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
      <div className='absolute inset-0 -z-10 bg-linear-to-b from-(--color-bg-base) via-(--color-bg-base) to-(--color-bg-surface-0)' />
      <Container size='full'>
        {error ? (
          <div className='flex items-center justify-center py-6'>
            <p className='text-sm text-secondary-token'>
              {error}
            </p>
          </div>
        ) : (
          /* Artist grid - centered, clean layout */
          <div className='flex flex-col items-center'>
            <FeaturedArtistsDriftRow creators={artists.slice(0, 12)} />
            <div className='mt-6 max-w-3xl text-center'>
              <p className='text-sm sm:text-base text-primary-token'>
                Used by artists turning clicks into streams, follows, tickets, and merch sales.
              </p>
              <p className='mt-2 text-xs sm:text-sm text-secondary-token'>
                Built by a team with experience driving large scale music growth.
              </p>
            </div>
          </div>
        )}
      </Container>
    </section>
  );
}
