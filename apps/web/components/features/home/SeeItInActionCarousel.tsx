'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { FeaturedCreator } from '@/lib/featured-creators';

const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExYTFhIi8+PC9zdmc+';

interface Props {
  readonly creators: FeaturedCreator[];
}

const CREATOR_LABELS = [
  'Release-first profile',
  'Tour conversion flow',
  'Audience capture setup',
] as const;

export function SeeItInActionCarousel({ creators }: Props) {
  const displayed = creators.slice(0, 3);

  return (
    <section className='section-spacing-linear-sm bg-[var(--linear-bg-page)]'>
      <div className='w-full px-5 sm:px-6 lg:px-[var(--linear-container-padding)] max-w-[var(--linear-content-max)] mx-auto'>
        <div className='flex flex-col items-center text-center gap-5'>
          <h2 className='marketing-h2-linear text-[color:var(--linear-text-primary)]'>
            See it in action
          </h2>
          <p className='max-w-md marketing-lead-linear text-[color:var(--linear-text-secondary)]'>
            See how artists use one Jovie profile for listening, touring, and
            fan capture.
          </p>
        </div>

        <div className='mt-14 grid grid-cols-1 sm:grid-cols-3 gap-6'>
          {displayed.map((creator, index) => (
            <Link
              key={creator.id}
              href={`/${creator.handle}`}
              className='group relative flex flex-col items-center rounded-xl p-6 transition-colors duration-[var(--linear-duration-normal)]'
              style={{
                backgroundColor: 'var(--linear-bg-surface-0)',
                border: '1px solid var(--linear-border-subtle)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              <div className='relative w-20 h-20 rounded-full overflow-hidden mb-4'>
                <Image
                  src={creator.src}
                  alt={`${creator.name}'s profile`}
                  fill
                  sizes='80px'
                  placeholder='blur'
                  blurDataURL={BLUR_DATA_URL}
                  className='object-cover'
                />
              </div>
              <p className='text-[15px] font-medium text-[color:var(--linear-text-primary)]'>
                {creator.name}
              </p>
              <p className='mt-1 text-[13px] text-[color:var(--linear-text-tertiary)] font-mono'>
                jov.ie/{creator.handle}
              </p>
              <span className='mt-3 rounded-full border border-[var(--linear-border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-[11px] font-medium text-[color:var(--linear-text-secondary)]'>
                {CREATOR_LABELS[index] ?? 'Artist growth profile'}
              </span>
              <span
                className='mt-4 inline-flex items-center rounded-lg px-4 py-2 text-[13px] font-medium transition-colors duration-[var(--linear-duration-normal)]'
                style={{
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--linear-border-subtle)',
                  color: 'var(--linear-text-secondary)',
                }}
              >
                View Profile
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
