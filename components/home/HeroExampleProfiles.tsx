import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getFeaturedCreators } from '@/lib/featured-creators';

const HERO_PREVIEW_COUNT = 4;

export async function HeroExampleProfiles() {
  try {
    const creators = await getFeaturedCreators();
    const previews = creators.slice(0, HERO_PREVIEW_COUNT);

    if (!previews.length) {
      return null;
    }

    return (
      <div className='mt-12'>
        {/* Section header */}
        <div className='flex items-center gap-3 mb-6'>
          <div className='h-px flex-1 bg-neutral-200 dark:bg-neutral-800' />
          <p className='text-xs font-medium tracking-wide uppercase text-neutral-500 dark:text-neutral-400'>
            Live profiles
          </p>
          <div className='h-px flex-1 bg-neutral-200 dark:bg-neutral-800' />
        </div>

        {/* Profile cards */}
        <div
          aria-label='Example creator profiles'
          className='flex items-center justify-center gap-4'
        >
          {previews.map(creator => (
            <Link
              key={creator.id}
              href={`/${creator.handle}`}
              className='group relative flex flex-col items-center'
            >
              {/* Avatar with ring */}
              <div className='relative'>
                <div className='w-14 h-14 rounded-full overflow-hidden border-2 border-neutral-200 dark:border-neutral-700 group-hover:border-neutral-400 dark:group-hover:border-neutral-500 transition-colors duration-150'>
                  <Image
                    src={creator.src}
                    alt={creator.name}
                    width={56}
                    height={56}
                    className='w-full h-full object-cover'
                  />
                </div>
                {/* Hover indicator */}
                <div className='absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150'>
                  <ArrowUpRight className='w-3 h-3 text-neutral-600 dark:text-neutral-400' />
                </div>
              </div>

              {/* Handle */}
              <p className='mt-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-100 transition-colors duration-150'>
                @{creator.handle}
              </p>
            </Link>
          ))}
        </div>

        {/* View all link */}
        <div className='mt-6 text-center'>
          <Link
            href='/explore'
            className='inline-flex items-center gap-1 text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors duration-150'
          >
            View all creators
            <ArrowUpRight className='w-3 h-3' />
          </Link>
        </div>
      </div>
    );
  } catch (error: unknown) {
    console.error('Error loading hero example profiles:', error);
    return null;
  }
}
