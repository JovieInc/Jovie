'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfilePlaceholderShot } from './ArtistProfilePlaceholderShot';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileOutcomesCarouselProps {
  readonly outcomes: ArtistProfileLandingCopy['outcomes'];
}

function outcomeVariant(
  id: ArtistProfileLandingCopy['outcomes']['cards'][number]['id']
) {
  switch (id) {
    case 'drive-streams':
      return 'outcome-listen';
    case 'fill-the-room':
      return 'outcome-local';
    case 'get-paid':
      return 'outcome-support';
    case 'capture-fans':
      return 'outcome-capture';
    case 'share-anywhere':
      return 'outcome-link';
  }
}

export function ArtistProfileOutcomesCarousel({
  outcomes,
}: Readonly<ArtistProfileOutcomesCarouselProps>) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollByAmount = (direction: 'prev' | 'next') => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    const delta = direction === 'next' ? 320 : -320;
    scroller.scrollBy({
      left: delta,
      behavior: 'smooth',
    });
  };

  return (
    <ArtistProfileSectionShell className='bg-white/[0.01]' width='landing'>
      <div className='flex items-end justify-between gap-6'>
        <div>
          <h2 className='marketing-h2-linear max-w-[14ch] text-primary-token'>
            {outcomes.headline}
          </h2>
          <p className='mt-5 max-w-[32rem] text-[15px] leading-[1.7] text-secondary-token'>
            {outcomes.body}
          </p>
        </div>
        <div className='hidden items-center gap-2 lg:flex'>
          <button
            type='button'
            onClick={() => {
              scrollByAmount('prev');
            }}
            className='rounded-full border border-white/10 bg-white/[0.03] p-2 text-secondary-token transition-colors hover:bg-white/[0.08] hover:text-primary-token'
            aria-label='Scroll outcomes left'
          >
            <ChevronLeft className='h-4 w-4' />
          </button>
          <button
            type='button'
            onClick={() => {
              scrollByAmount('next');
            }}
            className='rounded-full border border-white/10 bg-white/[0.03] p-2 text-secondary-token transition-colors hover:bg-white/[0.08] hover:text-primary-token'
            aria-label='Scroll outcomes right'
          >
            <ChevronRight className='h-4 w-4' />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className='mt-12 flex gap-5 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
      >
        {outcomes.cards.map((card, index) => (
          <article
            key={card.id}
            className='min-w-[82vw] snap-start overflow-hidden rounded-[2rem] bg-white/[0.035] sm:min-w-[560px] lg:min-w-[640px]'
          >
            <div className='grid min-h-[430px] grid-rows-[1fr_auto] p-7'>
              <div className='overflow-hidden rounded-[1.5rem] bg-black/28'>
                <ArtistProfilePlaceholderShot
                  variant={outcomeVariant(card.id)}
                  className='min-h-[260px]'
                />
              </div>
              <div className='mt-7 flex items-end justify-between gap-8'>
                <div>
                  <p className='font-mono text-[12px] tracking-[-0.02em] text-tertiary-token'>
                    0{index + 1}
                  </p>
                  <h3 className='mt-2 text-[28px] font-semibold leading-[1] tracking-[-0.05em] text-primary-token'>
                    {card.title}
                  </h3>
                </div>
                <p className='max-w-[18rem] text-[14px] leading-[1.55] text-secondary-token'>
                  {card.description}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </ArtistProfileSectionShell>
  );
}
