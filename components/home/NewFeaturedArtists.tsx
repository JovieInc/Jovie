import {
  type FeaturedCreator,
  FeaturedCreatorsSection,
} from '@/components/organisms/FeaturedArtistsSection';
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
    <section className='py-10 bg-white dark:bg-black'>
      <Container>
        <div className='text-center mb-6'>
          <p className='text-sm font-medium text-gray-600 dark:text-gray-400'>
            Explore example Jovie profiles
          </p>
        </div>

        {error ? (
          <div className='flex items-center justify-center py-6'>
            <p className='text-sm text-gray-600 dark:text-gray-400'>{error}</p>
          </div>
        ) : (
          <FeaturedCreatorsSection
            creators={artists}
            showTitle={false}
            showNames={true}
          />
        )}
      </Container>
    </section>
  );
}
