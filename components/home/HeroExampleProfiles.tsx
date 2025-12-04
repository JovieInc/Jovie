import { ArtistCard } from '@/components/molecules/ArtistCard';
import { getFeaturedCreators } from '@/lib/featured-creators';

const HERO_PREVIEW_COUNT = 3;

export async function HeroExampleProfiles() {
  const creators = await getFeaturedCreators();
  const previews = creators.slice(0, HERO_PREVIEW_COUNT);

  if (!previews.length) {
    return null;
  }

  return (
    <div className='mt-6 space-y-3'>
      <div className='flex items-center justify-between'>
        <p className='text-xs font-semibold uppercase tracking-[0.3em] text-gray-500 dark:text-gray-400'>
          Explore example profiles
        </p>
        <p className='text-xs font-medium text-gray-600 dark:text-gray-300'>
          Real creators, ready now
        </p>
      </div>

      <div
        aria-label='Example creator snapshots'
        className='group relative flex items-stretch gap-3 overflow-x-auto pb-2 pl-1 text-left'
      >
        {previews.map(creator => (
          <div
            key={creator.id}
            className='shrink-0 w-28 rounded-3xl bg-white/80 dark:bg-white/5 p-2 shadow-[0_10px_25px_rgba(15,23,42,0.1)] dark:shadow-[0_8px_20px_rgba(0,0,0,0.3)] backdrop-blur'
          >
            <ArtistCard
              handle={creator.handle}
              name={creator.name}
              src={creator.src}
              size='sm'
              showName
              className='w-full'
            />
          </div>
        ))}
      </div>
    </div>
  );
}
