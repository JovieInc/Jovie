import Image from 'next/image';
import Link from 'next/link';
import { getFeaturedCreators } from '@/lib/featured-creators';

const HERO_PREVIEW_COUNT = 12;

export async function HeroExampleProfiles() {
  try {
    const creators = await getFeaturedCreators();
    const previews = creators.slice(0, HERO_PREVIEW_COUNT);

    if (!previews.length) {
      return null;
    }

    return (
      <div className='py-10 sm:py-12 max-w-full overflow-hidden'>
        {/* Section header */}
        <div className='flex items-center gap-3 mb-6'>
          <div className='h-px flex-1 bg-neutral-200 dark:bg-neutral-800' />
          <p className='text-xs font-medium tracking-wide uppercase text-neutral-500 dark:text-neutral-400'>
            Live profiles
          </p>
          <div className='h-px flex-1 bg-neutral-200 dark:bg-neutral-800' />
        </div>

        {/* Full-width horizontal scroll (no fades, no visible scrollbar) */}
        <div className='w-full overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
          {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label needed for accessibility */}
          <div
            aria-label='Example creator profiles'
            className='flex w-max items-start gap-6 px-4 sm:px-6 lg:px-8'
          >
            {previews.map(creator => (
              <Link
                key={creator.id}
                href={`/${creator.handle}`}
                className='group relative flex shrink-0 flex-col items-center'
              >
                <div className='w-14 h-14 rounded-full overflow-hidden border-2 border-neutral-200 dark:border-neutral-700 group-hover:border-neutral-400 dark:group-hover:border-neutral-500 transition-colors duration-150'>
                  <Image
                    src={creator.src}
                    alt={creator.name}
                    width={56}
                    height={56}
                    className='w-full h-full object-cover'
                  />
                </div>

                <p className='mt-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-100 transition-colors duration-150'>
                  @{creator.handle}
                </p>
              </Link>
            ))}
          </div>
        </div>

        {/* View all link */}
        <div className='mt-6 text-center'>
          <Link
            href='/explore'
            className='inline-flex items-center gap-1 text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors duration-150'
          >
            View all creators
          </Link>
        </div>
      </div>
    );
  } catch (error: unknown) {
    console.error('Error loading hero example profiles:', error);
    return null;
  }
}
