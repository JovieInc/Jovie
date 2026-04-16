'use client';

import type { LucideIcon } from 'lucide-react';
import {
  ChevronLeft,
  ChevronRight,
  Moon,
  Music2,
  QrCode,
  Route,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useRef } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileOutcomesCarouselProps {
  readonly outcomes: ArtistProfileLandingCopy['outcomes'];
}

const OUTCOME_CARD_ICONS: Record<
  ArtistProfileLandingCopy['outcomes']['cards'][number]['id'],
  LucideIcon
> = {
  'dedicated-release-pages': Music2,
  'trackable-qr-codes': QrCode,
  'dark-mode-first': Moon,
  'intelligent-routing': Route,
};

const OUTCOME_CARD_ACCENTS: Record<
  ArtistProfileLandingCopy['outcomes']['cards'][number]['id'],
  string
> = {
  'dedicated-release-pages': 'var(--color-accent-teal)',
  'trackable-qr-codes': 'var(--color-accent-orange)',
  'dark-mode-first': 'var(--color-accent-gray)',
  'intelligent-routing': 'var(--color-accent-purple)',
};

type OutcomeAccentStyle = CSSProperties & {
  readonly '--outcome-accent': string;
};

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
          {outcomes.body ? (
            <p className='mt-5 max-w-[32rem] text-[15px] leading-[1.7] text-secondary-token'>
              {outcomes.body}
            </p>
          ) : null}
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
          <OutcomeCard key={card.id} card={card} index={index} />
        ))}
      </div>
    </ArtistProfileSectionShell>
  );
}

function OutcomeCard({
  card,
  index,
}: {
  readonly card: ArtistProfileLandingCopy['outcomes']['cards'][number];
  readonly index: number;
}) {
  const Icon = OUTCOME_CARD_ICONS[card.id];
  const style: OutcomeAccentStyle = {
    '--outcome-accent': OUTCOME_CARD_ACCENTS[card.id],
  };

  return (
    <article
      className='group relative min-w-[88vw] snap-start overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[#050505] sm:min-w-[660px] lg:min-w-[780px]'
      style={style}
    >
      <div
        className='absolute inset-0 opacity-80'
        style={{
          background:
            'radial-gradient(circle at 78% 70%, color-mix(in srgb, var(--outcome-accent) 20%, transparent), transparent 32%), linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.015) 42%, rgba(0,0,0,0.4))',
        }}
        aria-hidden='true'
      />
      <div className='relative grid min-h-[380px] grid-rows-[auto_1fr] p-7 sm:min-h-[430px] sm:p-8 lg:min-h-[460px]'>
        <div>
          <p className='font-mono text-[12px] tracking-[-0.02em] text-tertiary-token'>
            0{index + 1}
          </p>
          <h3 className='mt-4 max-w-[13ch] text-[30px] font-semibold leading-[1] tracking-[-0.055em] text-primary-token sm:text-[38px]'>
            {card.title}
          </h3>
          <p className='mt-4 max-w-[24rem] text-[14px] leading-[1.55] text-secondary-token sm:text-[15px]'>
            {card.description}
          </p>
        </div>

        <div className='relative mt-8 overflow-hidden rounded-[1.6rem] border border-white/[0.08] bg-black/35 sm:mt-10'>
          <div
            className='absolute inset-0'
            style={{
              background:
                'radial-gradient(circle at 24% 24%, color-mix(in srgb, var(--outcome-accent) 18%, transparent), transparent 34%)',
            }}
            aria-hidden='true'
          />
          <div className='relative flex min-h-[150px] items-center justify-between gap-8 px-6 py-6 sm:min-h-[170px] sm:px-8'>
            <div className='grid gap-3'>
              <span className='h-2 w-20 rounded-full bg-white/12' />
              <span className='h-2 w-32 rounded-full bg-white/8' />
              <span className='h-2 w-24 rounded-full bg-white/6' />
            </div>
            <div
              className='grid h-24 w-24 shrink-0 place-items-center rounded-[1.45rem] bg-white/[0.04] text-[color:var(--outcome-accent)] transition-transform duration-300 group-hover:scale-[1.03] sm:h-32 sm:w-32'
              aria-hidden='true'
            >
              <Icon className='h-10 w-10 sm:h-14 sm:w-14' strokeWidth={1.7} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
