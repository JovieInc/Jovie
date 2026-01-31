import { captureException } from '@sentry/nextjs';
import { type FeaturedCreator } from '@/components/organisms/FeaturedArtistsSection';
import { Container } from '@/components/site/Container';
import { getFeaturedCreators } from '@/lib/featured-creators';
import { FeaturedArtistsDriftRow } from './FeaturedArtistsDriftRow';

export interface NewFeaturedArtistsProps {
  readonly showFades?: boolean;
}

export async function NewFeaturedArtists({
  showFades = true,
}: NewFeaturedArtistsProps) {
  let artists: FeaturedCreator[] = [];
  let error: string | null = null;

  try {
    artists = await getFeaturedCreators();
  } catch (err) {
    captureException(err, { extra: { context: 'featured-artists' } });
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
            <p className='text-sm text-secondary-token'>{error}</p>
          </div>
        ) : (
          /* Artist grid - centered, clean layout */
          <div className='relative'>
            <FeaturedArtistsDriftRow
              creators={artists.slice(0, 12)}
              showFades={showFades}
            />
          </div>
        )}
      </Container>
    </section>
  );
}
