'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import type { CSSProperties } from 'react';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
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
  'box-shadow 240ms cubic-bezier(0.22,1,0.36,1), background 240ms cubic-bezier(0.22,1,0.36,1)';

export function ArtistProfileOutcomesCarousel({
  outcomes,
}: Readonly<ArtistProfileOutcomesCarouselProps>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const programmaticTargetIndexRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
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
        behavior: 'smooth',
      });
    },
    [outcomes.cards.length]
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
      className='bg-white/[0.01]'
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
          <div className='artist-profile-outcomes-controls pointer-events-none absolute right-[max(1.25rem,calc((100vw-var(--linear-content-max))/2+1.25rem))] top-5 z-20 items-center gap-2'>
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
            className='relative flex gap-3.5 overflow-x-auto overflow-y-hidden scroll-smooth snap-x snap-mandatory pb-2 pl-[max(1.25rem,calc((100vw-var(--linear-content-max))/2+1.25rem))] pr-[9vw] [-ms-overflow-style:none] [scrollbar-width:none] scrollbar-hide sm:gap-4 sm:pl-[max(1.5rem,calc((100vw-var(--linear-content-max))/2+1.5rem))] sm:pr-[10vw] lg:hidden [&::-webkit-scrollbar]:hidden'
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
                layout='carousel'
                outcomes={outcomes}
                testId='artist-profile-outcome-card'
              />
            ))}
          </div>

          <div
            data-testid='artist-profile-outcomes-grid'
            className='mx-auto hidden max-w-[var(--linear-content-max)] gap-4 px-5 sm:px-6 lg:grid lg:grid-cols-2 lg:px-0'
          >
            {outcomes.cards.map(card => (
              <OutcomeCard
                key={`${card.id}-desktop`}
                active
                card={card}
                layout='grid'
                outcomes={outcomes}
              />
            ))}
          </div>
        </div>
      </div>
      <style>{`
        .artist-profile-outcomes-controls {
          display: none;
        }

        @media (min-width: 768px) and (max-width: 1023px) {
          .artist-profile-outcomes-controls {
            display: flex;
          }
        }
      `}</style>
    </ArtistProfileSectionShell>
  );
}

const OutcomeCard = forwardRef<
  HTMLElement,
  Readonly<{
    active: boolean;
    card: ArtistProfileLandingCopy['outcomes']['cards'][number];
    layout?: 'carousel' | 'grid';
    outcomes: ArtistProfileLandingCopy['outcomes'];
    testId?: string;
  }>
>(function OutcomeCard(
  { active, card, layout = 'carousel', outcomes, testId },
  ref
) {
  const style: OutcomeAccentStyle = {
    '--outcome-accent': OUTCOME_CARD_ACCENTS[card.id],
    opacity: 1,
    transform: 'translateY(0)',
    boxShadow: '0 24px 56px rgba(0,0,0,0.26)',
    transition: OUTCOME_CARD_TRANSITION,
  };
  if (layout === 'carousel') {
    style.flex = '0 0 clamp(20rem, 72vw, 50rem)';
  }
  const proof = outcomes.syntheticProofs;

  return (
    <article
      data-testid={testId}
      ref={ref}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-[1.55rem] bg-[#050505] focus:outline-none',
        layout === 'carousel'
          ? 'min-h-[26rem] snap-start sm:min-h-[27rem] xl:min-h-[29rem]'
          : 'min-h-[28rem] xl:min-h-[29rem]'
      )}
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
    <div className='relative ml-auto h-[18.5rem] w-full max-w-[24rem] overflow-hidden rounded-[1.35rem]'>
      <div className='absolute inset-x-7 bottom-3 h-10 rounded-full bg-white/10 blur-3xl' />
      <div className='absolute right-0 top-0 h-[17.25rem] w-[10.9rem] overflow-hidden rounded-[1.2rem] border border-white/8 bg-black/24 shadow-[0_22px_56px_rgba(0,0,0,0.34)]'>
        <Image
          alt={proof.liveScreenshotAlt}
          className='object-cover object-top'
          fill
          sizes='(max-width: 768px) 10.9rem, 10.9rem'
          src={proof.liveScreenshotSrc}
        />
      </div>

      <div className='absolute left-3 bottom-4 z-10 h-[14.4rem] w-[8.85rem] overflow-hidden rounded-[1.15rem] border border-white/8 bg-black/24 shadow-[0_22px_56px_rgba(0,0,0,0.32)] sm:left-4'>
        <Image
          alt={proof.presaveScreenshotAlt}
          className='object-cover object-top'
          fill
          sizes='(max-width: 768px) 8.85rem, 8.85rem'
          src={proof.presaveScreenshotSrc}
        />
      </div>

      <div className='absolute bottom-4 right-3 z-10 max-w-[10rem] sm:right-4'>
        <p className='text-[1.15rem] font-semibold leading-[1.04] tracking-[-0.05em] text-white'>
          {proof.title}
        </p>
        <p className='mt-1 text-[12px] font-medium leading-[1.35] text-white/62'>
          {proof.artistName}
        </p>
        <div className='mt-3 flex flex-wrap gap-2'>
          <span className='rounded-full border border-white/8 bg-white/[0.05] px-2.75 py-1.25 text-[10.5px] font-medium text-white/72'>
            {proof.liveLabel}
          </span>
          <span className='rounded-full border border-white/8 bg-white/[0.05] px-2.75 py-1.25 text-[10.5px] font-medium text-white/72'>
            {proof.presaveLabel}
          </span>
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
    <div className='relative h-[18rem] w-full max-w-[24.5rem] overflow-hidden rounded-[1.35rem]'>
      <div className='absolute left-0 top-2 h-[15.9rem] w-[8.85rem] overflow-hidden rounded-[1.2rem] border border-white/8 bg-black/28 shadow-[0_20px_48px_rgba(0,0,0,0.26)]'>
        <Image
          alt={proof.screenshotAlt}
          className='object-cover object-top'
          fill
          sizes='(max-width: 768px) 8.85rem, 8.85rem'
          src={proof.screenshotSrc}
        />
      </div>

      <div className='absolute bottom-2 right-0 w-[16rem] rounded-[1.25rem] border border-white/7 bg-black/32 px-4 pb-4 pt-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'>
        <p className='text-[12px] font-semibold tracking-[-0.02em] text-white'>
          {proof.drawerTitle}
        </p>
        <p className='mt-1 text-[11px] text-white/44'>{proof.drawerSubtitle}</p>
        <div className='mt-3 divide-y divide-white/6'>
          {proof.drawerRows.map(row => (
            <div
              key={row.id}
              className='grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2.5 py-2.5'
            >
              <span className='text-[11px] font-medium tracking-[-0.01em] text-white/52'>
                {row.month} {row.day}
              </span>
              <span className='min-w-0'>
                <span className='block truncate text-[12.5px] font-semibold text-white'>
                  {row.venue}
                </span>
                <span className='block truncate text-[11px] text-white/44'>
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

      <div className='absolute right-[3.4rem] top-2 z-10 w-[11rem] rounded-[1.15rem] bg-[#f4f1e8] p-3.5 text-black shadow-[0_20px_42px_rgba(0,0,0,0.3)]'>
        <p className='text-[10px] font-semibold tracking-[0.08em] text-black/54'>
          {proof.nearbyCardLabel}
        </p>
        <p className='mt-2.5 text-[1.5rem] font-semibold leading-none tracking-[-0.07em]'>
          {proof.nearbyDate}
        </p>
        <p className='mt-2.5 text-[0.9rem] font-semibold leading-[1.08] tracking-[-0.03em]'>
          {proof.nearbyVenue}
        </p>
        <p className='mt-1 text-[12px] leading-[1.35] text-black/58'>
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
        <p className='text-[11px] font-medium tracking-[-0.01em] text-white/48'>
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
    <div className='mx-auto flex min-h-[15.5rem] w-full max-w-[16rem] flex-col items-center justify-center rounded-[1.4rem] bg-[#fbfaf6] px-4.5 py-5 text-center text-black shadow-[0_20px_40px_rgba(0,0,0,0.22)]'>
      <p className='text-[11px] font-semibold tracking-[0.02em] text-black/72'>
        {proof.title}
      </p>
      <div className='relative mt-4.5'>
        <div className='absolute -left-8 top-4 rounded-full bg-black/6 px-2.5 py-1 text-[10px] font-medium text-black/54'>
          Bio
        </div>
        <div className='absolute -right-10 top-10 rounded-full bg-black/6 px-2.5 py-1 text-[10px] font-medium text-black/54'>
          Stories
        </div>
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
      <p className='mt-2 text-[11px] font-medium text-black/56'>
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
