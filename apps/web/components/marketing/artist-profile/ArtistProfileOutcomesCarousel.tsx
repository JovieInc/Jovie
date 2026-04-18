'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import type { CSSProperties } from 'react';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { getAccentCssVars } from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';
import {
  clampOutcomeIndex,
  getNearestOutcomeIndex,
} from './ArtistProfileOutcomesCarousel.utils';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileOutcomesCarouselProps {
  readonly outcomes: ArtistProfileLandingCopy['outcomes'];
}

type OutcomeId = ArtistProfileLandingCopy['outcomes']['cards'][number]['id'];

const OUTCOME_CARD_ACCENTS: Record<OutcomeId, string> = {
  'drive-streams': getAccentCssVars('blue').solid,
  'sell-out': getAccentCssVars('purple').solid,
  'get-paid': getAccentCssVars('green').solid,
  'share-anywhere': getAccentCssVars('orange').solid,
};

type OutcomeAccentStyle = CSSProperties & {
  readonly '--outcome-accent': string;
};

const SCROLL_TARGET_TOLERANCE = 2;
const OUTCOME_CARD_TRANSITION =
  'transform 340ms cubic-bezier(0.22,1,0.36,1), opacity 340ms cubic-bezier(0.22,1,0.36,1), box-shadow 340ms cubic-bezier(0.22,1,0.36,1)';

export function ArtistProfileOutcomesCarousel({
  outcomes,
}: Readonly<ArtistProfileOutcomesCarouselProps>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const programmaticTargetIndexRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const maxCardIndex = outcomes.cards.length - 1;

  const getCardRects = useCallback(() => {
    return cardRefs.current.flatMap(card => {
      if (!card) {
        return [];
      }

      return [
        {
          left: card.offsetLeft,
          width: card.offsetWidth,
        },
      ];
    });
  }, []);

  const syncNearestCard = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    const targetIndex = programmaticTargetIndexRef.current;
    if (targetIndex !== null) {
      const targetCard = cardRefs.current[targetIndex];
      if (!targetCard) {
        programmaticTargetIndexRef.current = null;
        return;
      }

      if (
        Math.abs(scroller.scrollLeft - targetCard.offsetLeft) <=
        SCROLL_TARGET_TOLERANCE
      ) {
        programmaticTargetIndexRef.current = null;
      } else {
        return;
      }
    }

    setActiveCardIndex(
      getNearestOutcomeIndex(
        getCardRects(),
        scroller.scrollLeft,
        scroller.clientWidth
      )
    );
  }, [getCardRects]);

  const scrollToCard = useCallback(
    (index: number) => {
      const scroller = scrollerRef.current;
      const targetIndex = clampOutcomeIndex(index, outcomes.cards.length);
      const targetCard = cardRefs.current[targetIndex];
      if (!scroller || !targetCard) {
        return;
      }

      programmaticTargetIndexRef.current = targetIndex;
      setActiveCardIndex(targetIndex);
      scroller.scrollTo({
        left: targetCard.offsetLeft,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    },
    [outcomes.cards.length, reducedMotion]
  );

  const scrollByDirection = useCallback(
    (direction: 'prev' | 'next') => {
      scrollToCard(activeCardIndex + (direction === 'next' ? 1 : -1));
    },
    [activeCardIndex, scrollToCard]
  );

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    const handleScroll = () => {
      if (scrollRafRef.current !== null) {
        globalThis.cancelAnimationFrame(scrollRafRef.current);
      }

      scrollRafRef.current = globalThis.requestAnimationFrame(() => {
        syncNearestCard();
        scrollRafRef.current = null;
      });
    };

    scroller.addEventListener('scroll', handleScroll, { passive: true });
    syncNearestCard();

    return () => {
      scroller.removeEventListener('scroll', handleScroll);
      if (scrollRafRef.current !== null) {
        globalThis.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [syncNearestCard]);

  useEffect(() => {
    if (globalThis.ResizeObserver === undefined) {
      globalThis.addEventListener('resize', syncNearestCard);
      return () => {
        globalThis.removeEventListener('resize', syncNearestCard);
      };
    }

    const resizeObserver = new globalThis.ResizeObserver(() => {
      syncNearestCard();
    });

    if (scrollerRef.current) {
      resizeObserver.observe(scrollerRef.current);
    }

    for (const card of cardRefs.current) {
      if (card) {
        resizeObserver.observe(card);
      }
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [outcomes.cards.length, syncNearestCard]);

  return (
    <ArtistProfileSectionShell
      className='bg-white/[0.01] py-24 sm:py-28 lg:py-32'
      containerClassName='!max-w-none !px-0'
      width='page'
    >
      <div>
        <div className='mx-auto max-w-[var(--linear-content-max)] px-5 sm:px-6 lg:px-0'>
          <ArtistProfileSectionHeader
            align='left'
            headline={outcomes.headline}
            body={outcomes.body}
            className='max-w-[38rem]'
            headlineClassName='max-w-none text-[clamp(2.7rem,4.6vw,4.25rem)]'
            bodyClassName='max-w-[28rem]'
          />
        </div>

        <div className='relative mt-10 w-full overflow-x-hidden'>
          <div className='pointer-events-none absolute right-[max(1.25rem,calc((100vw-var(--linear-content-max))/2+1.25rem))] top-5 z-20 hidden items-center gap-2 lg:flex'>
            <button
              type='button'
              onClick={() => {
                scrollByDirection('prev');
              }}
              disabled={activeCardIndex === 0}
              className={cn(
                'pointer-events-auto rounded-full border border-white/10 bg-black/62 p-2.5 text-white shadow-[0_18px_44px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-colors',
                activeCardIndex === 0
                  ? 'cursor-not-allowed opacity-35'
                  : 'hover:bg-white hover:text-black'
              )}
              aria-label='Scroll outcomes left'
            >
              <ChevronLeft className='h-4 w-4' />
            </button>
            <button
              type='button'
              onClick={() => {
                scrollByDirection('next');
              }}
              disabled={activeCardIndex === maxCardIndex}
              className={cn(
                'pointer-events-auto rounded-full border border-white/10 bg-black/62 p-2.5 text-white shadow-[0_18px_44px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-colors',
                activeCardIndex === maxCardIndex
                  ? 'cursor-not-allowed opacity-35'
                  : 'hover:bg-white hover:text-black'
              )}
              aria-label='Scroll outcomes right'
            >
              <ChevronRight className='h-4 w-4' />
            </button>
          </div>
          <div
            ref={scrollerRef}
            data-testid='artist-profile-outcomes-scroller'
            className='relative flex gap-3.5 overflow-x-auto overflow-y-hidden overscroll-contain scroll-smooth snap-x snap-mandatory pb-2 pl-[max(1.25rem,calc((100vw-var(--linear-content-max))/2+1.25rem))] pr-[9vw] [-ms-overflow-style:none] [scrollbar-width:none] scrollbar-hide sm:gap-4 sm:pl-[max(1.5rem,calc((100vw-var(--linear-content-max))/2+1.5rem))] sm:pr-[10vw] lg:pl-[max(0px,calc((100vw-var(--linear-content-max))/2))] lg:pr-[12vw] [&::-webkit-scrollbar]:hidden'
          >
            <button
              type='button'
              onClick={() => {
                scrollByDirection('next');
              }}
              className='sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-full focus:bg-white focus:px-3 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-black'
            >
              Scroll outcomes
            </button>
            {outcomes.cards.map((card, index) => (
              <OutcomeCard
                key={card.id}
                ref={node => {
                  cardRefs.current[index] = node;
                }}
                active={index === activeCardIndex}
                card={card}
                outcomes={outcomes}
                reducedMotion={reducedMotion}
              />
            ))}
          </div>
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}

const OutcomeCard = forwardRef<
  HTMLElement,
  Readonly<{
    active: boolean;
    card: ArtistProfileLandingCopy['outcomes']['cards'][number];
    outcomes: ArtistProfileLandingCopy['outcomes'];
    reducedMotion: boolean;
  }>
>(function OutcomeCard({ active, card, outcomes, reducedMotion }, ref) {
  const style: OutcomeAccentStyle = {
    '--outcome-accent': OUTCOME_CARD_ACCENTS[card.id],
    flex: '0 0 clamp(20rem, 72vw, 50rem)',
    opacity: reducedMotion ? 1 : active ? 1 : 0.78,
    transform: reducedMotion
      ? 'translateY(0)'
      : active
        ? 'translateY(0)'
        : 'translateY(6px)',
    boxShadow: active
      ? '0 30px 70px rgba(0,0,0,0.34)'
      : '0 20px 46px rgba(0,0,0,0.2)',
    transition: OUTCOME_CARD_TRANSITION,
  };
  const proof = outcomes.syntheticProofs;

  return (
    <article
      data-testid='artist-profile-outcome-card'
      ref={ref}
      className='group relative flex min-h-[26rem] snap-start flex-col overflow-hidden rounded-[1.55rem] bg-[#050505] focus:outline-none sm:min-h-[27rem] lg:min-h-[28rem] xl:min-h-[29rem]'
      style={style}
    >
      <div
        className='absolute inset-0 transition-opacity duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)]'
        style={{
          background: `radial-gradient(circle at 72% 78%, color-mix(in srgb, var(--outcome-accent) ${
            active ? '18%' : '10%'
          }, transparent), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.014) 44%, rgba(0,0,0,0.42))`,
          opacity: active ? 0.92 : 0.72,
        }}
        aria-hidden='true'
      />

      <div className='relative flex h-full flex-col p-5 sm:p-5.5 lg:p-6'>
        <div className='min-w-0'>
          <h3 className='max-w-[10ch] text-[clamp(2.05rem,3.6vw,3.25rem)] font-semibold leading-[0.92] tracking-[-0.07em] text-primary-token'>
            {card.title}
          </h3>
          <p className='mt-3 max-w-[19rem] text-[13px] leading-[1.58] text-secondary-token'>
            {card.description}
          </p>
        </div>

        <div className='mt-auto pt-7 sm:pt-8'>
          {card.id === 'drive-streams' ? (
            <DriveStreamsProof proof={proof.visualProofs.driveStreams} />
          ) : null}
          {card.id === 'sell-out' ? (
            <SellOutProof proof={proof.visualProofs.sellOut} />
          ) : null}
          {card.id === 'get-paid' ? (
            <GetPaidProof proof={proof.visualProofs.getPaid} />
          ) : null}
          {card.id === 'share-anywhere' ? (
            <ShareProof proof={proof.shareAnywhere} />
          ) : null}
        </div>
      </div>
    </article>
  );
});

function DriveStreamsProof({
  proof,
}: Readonly<{
  proof: ArtistProfileLandingCopy['outcomes']['syntheticProofs']['visualProofs']['driveStreams'];
}>) {
  return (
    <div className='max-w-[20rem] rounded-[1.25rem] border border-white/7 bg-black/26 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-4'>
      <div className='border-b border-white/6 pb-3.5'>
        <p className='text-[11px] font-medium tracking-[-0.01em] text-white/68'>
          {proof.floatingCardLabel}
        </p>
        <p className='mt-2.5 text-[1.15rem] font-semibold leading-[1.06] tracking-[-0.04em] text-white'>
          {proof.floatingCardTitle}
        </p>
        <p className='mt-1 text-[12px] font-medium text-white/64'>
          {proof.artistName}
        </p>
      </div>

      <div className='divide-y divide-white/6 py-1.5'>
        <div className='flex items-center justify-between gap-4 py-2.5 text-[11.5px] text-white/58'>
          <span>Status</span>
          <span className='text-white/86'>{proof.floatingCardMeta}</span>
        </div>
        <div className='flex items-center justify-between gap-4 py-2.5 text-[11.5px] text-white/58'>
          <span>CTA</span>
          <span className='text-white/86'>{proof.primaryCtaLabel}</span>
        </div>
        <div className='flex items-center justify-between gap-4 py-2.5 text-[11.5px] text-white/58'>
          <span>Placement</span>
          <span className='text-white/86'>Front of profile</span>
        </div>
      </div>
    </div>
  );
}

function SellOutProof({
  proof,
}: Readonly<{
  proof: ArtistProfileLandingCopy['outcomes']['syntheticProofs']['visualProofs']['sellOut'];
}>) {
  return (
    <div className='relative h-[17.25rem] w-full max-w-[23rem] overflow-hidden rounded-[1.35rem]'>
      <div className='absolute inset-x-0 bottom-0 rounded-[1.25rem] border border-white/7 bg-black/32 px-3.5 pb-3.5 pt-11 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:px-4 sm:pb-4'>
        <p className='text-[12px] font-semibold tracking-[-0.02em] text-white'>
          {proof.drawerTitle}
        </p>
        <p className='mt-1 text-[11px] text-white/68'>{proof.drawerSubtitle}</p>
        <div className='mt-3 divide-y divide-white/6'>
          {proof.drawerRows.map(row => (
            <div
              key={row.id}
              className='grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2.5 py-2.5'
            >
              <span className='text-[11px] font-medium tracking-[-0.01em] text-white/70'>
                {row.month} {row.day}
              </span>
              <span className='min-w-0'>
                <span className='block truncate text-[12.5px] font-semibold text-white'>
                  {row.venue}
                </span>
                <span className='block truncate text-[11px] text-white/66'>
                  {row.location}
                </span>
              </span>
              <span className='text-[11px] font-medium text-white/68'>
                {row.ctaLabel}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className='absolute right-3.5 top-3.5 z-10 w-[11.75rem] rounded-[1.15rem] bg-[#f4f1e8] p-3.5 text-black shadow-[0_20px_42px_rgba(0,0,0,0.3)] sm:right-4 sm:top-4'>
        <p className='text-[10px] font-semibold tracking-[0.08em] text-black/72'>
          {proof.nearbyCardLabel}
        </p>
        <p className='mt-2.5 text-[1.5rem] font-semibold leading-none tracking-[-0.07em]'>
          {proof.nearbyDate}
        </p>
        <p className='mt-2.5 text-[0.9rem] font-semibold leading-[1.08] tracking-[-0.03em]'>
          {proof.nearbyVenue}
        </p>
        <p className='mt-1 text-[12px] leading-[1.35] text-black/74'>
          {proof.nearbyLocation}
        </p>
        <span className='mt-3 inline-flex rounded-full bg-black px-2.75 py-1.25 text-[10.5px] font-semibold text-white'>
          {proof.nearbyCtaLabel}
        </span>
      </div>
    </div>
  );
}

function GetPaidProof({
  proof,
}: Readonly<{
  proof: ArtistProfileLandingCopy['outcomes']['syntheticProofs']['visualProofs']['getPaid'];
}>) {
  return (
    <div className='relative ml-auto h-[17.5rem] w-full max-w-[24rem] overflow-hidden rounded-[1.35rem]'>
      <div className='absolute inset-x-8 bottom-3 h-9 rounded-full bg-white/10 blur-3xl' />
      <div className='absolute right-0 top-3 h-[16.5rem] w-[13.75rem] overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#0d1015] shadow-[0_22px_56px_rgba(0,0,0,0.34)] sm:top-2 sm:h-[17.75rem] sm:w-[15rem]'>
        <Image
          alt={proof.screenshotAlt}
          className='object-cover object-bottom'
          fill
          sizes='(max-width: 768px) 13.75rem, 15rem'
          src={proof.screenshotSrc}
        />
      </div>
      <div className='absolute left-0 bottom-4 rounded-[1.05rem] border border-white/10 bg-black/34 px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'>
        <p className='text-[11px] font-medium tracking-[-0.01em] text-white/66'>
          {proof.drawerTitle}
        </p>
        <p className='mt-1 text-[12.5px] font-semibold tracking-[-0.03em] text-white'>
          {proof.drawerSubtitle}
        </p>
      </div>
    </div>
  );
}

function ShareProof({
  proof,
}: Readonly<{
  proof: ArtistProfileLandingCopy['outcomes']['syntheticProofs']['shareAnywhere'];
}>) {
  return (
    <div className='mx-auto flex min-h-[15.5rem] w-full max-w-[15.5rem] flex-col items-center justify-center rounded-[1.4rem] bg-[#fbfaf6] px-4.5 py-5 text-center text-black shadow-[0_20px_40px_rgba(0,0,0,0.22)]'>
      <p className='text-[11px] font-semibold tracking-[0.02em] text-black/72'>
        {proof.title}
      </p>
      <div className='relative mt-4.5'>
        <div className='absolute inset-x-7 -top-4 h-8 rounded-full bg-black/10 blur-2xl' />
        <div className='relative rounded-[1.3rem] bg-white p-2.5 shadow-[0_14px_26px_rgba(0,0,0,0.12)]'>
          <div className='grid grid-cols-7 gap-[6px]'>
            {QR_CELLS.map(cell => (
              <span
                key={cell.id}
                className='h-2.5 w-2.5 rounded-[3px]'
                style={{
                  backgroundColor: cell.filled ? '#0b0b0b' : '#f2f0ea',
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <p className='mt-3.5 font-mono text-[11.5px] font-semibold tracking-[-0.02em] text-black'>
        {proof.url}
      </p>
      <p className='mt-2 text-[11px] font-medium text-black/68'>
        {proof.subtitle}
      </p>
    </div>
  );
}

const QR_PATTERN = [
  '1110111',
  '1010101',
  '1110111',
  '0001000',
  '1111101',
  '1010001',
  '1110111',
] as const;

const QR_CELLS = QR_PATTERN.flatMap((row, rowIndex) =>
  row.split('').map((cell, cellIndex) => ({
    id: `r${rowIndex}c${cellIndex}`,
    filled: cell === '1',
  }))
);
