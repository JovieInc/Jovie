'use client';

import {
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Mail,
  MapPin,
  Music2,
} from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import {
  clampOutcomeIndex,
  getNearestOutcomeIndex,
} from './ArtistProfileOutcomesCarousel.utils';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileMonetizationSectionProps {
  readonly monetization: ArtistProfileLandingCopy['monetization'];
}

type MonetizationCardId = 'irl-payments' | 'capture' | 'thanks' | 'reengage';

const SCROLL_TARGET_TOLERANCE = 2;

export function ArtistProfileMonetizationSection({
  monetization,
}: Readonly<ArtistProfileMonetizationSectionProps>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const programmaticTargetIndexRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  const cards: readonly {
    readonly id: MonetizationCardId;
    readonly title: string;
    readonly body: string;
    readonly textAnchor: 'top' | 'bottom';
    readonly visualSide: 'left' | 'right';
  }[] = [
    {
      id: 'irl-payments',
      title: monetization.irlPaymentsCard.title,
      body: monetization.irlPaymentsCard.body,
      textAnchor: monetization.irlPaymentsCard.textAnchor,
      visualSide: monetization.irlPaymentsCard.visualSide,
    },
    {
      id: 'capture',
      title: monetization.captureCard.title,
      body: monetization.captureCard.body,
      textAnchor: monetization.captureCard.textAnchor,
      visualSide: monetization.captureCard.visualSide,
    },
    {
      id: 'thanks',
      title: monetization.thanksCard.title,
      body: monetization.thanksCard.body,
      textAnchor: monetization.thanksCard.textAnchor,
      visualSide: monetization.thanksCard.visualSide,
    },
    {
      id: 'reengage',
      title: monetization.reengageCard.title,
      body: monetization.reengageCard.body,
      textAnchor: monetization.reengageCard.textAnchor,
      visualSide: monetization.reengageCard.visualSide,
    },
  ];

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
      const targetIndex = clampOutcomeIndex(index, cards.length);
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
    [cards.length, reducedMotion]
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
  }, [cards.length, syncNearestCard]);

  return (
    <ArtistProfileSectionShell
      className='bg-[#050608]'
      containerClassName='!max-w-none !px-0'
      width='page'
    >
      <div>
        <div className='mx-auto max-w-[var(--linear-content-max)] px-5 sm:px-6 lg:px-0'>
          <div className='max-w-[34rem]'>
            <h2 className='text-[clamp(2.7rem,5.25vw,4.6rem)] font-[650] leading-[0.94] tracking-[-0.072em] text-primary-token'>
              <span className='block'>Get paid.</span>
              <span className='block'>Again and again.</span>
            </h2>
            <p className='mt-5 max-w-[28rem] text-[clamp(1rem,1.55vw,1.16rem)] leading-[1.65] tracking-[-0.02em] text-secondary-token'>
              {monetization.subhead}
            </p>
          </div>
        </div>

        <div className='relative mt-10 w-full overflow-x-hidden'>
          <section
            ref={scrollerRef}
            data-testid='artist-profile-monetization-scroller'
            aria-label='Monetization card carousel'
            className='relative flex gap-3.5 overflow-x-auto overflow-y-hidden overscroll-contain scroll-smooth snap-x snap-mandatory pb-2 pl-[max(1.25rem,calc((100vw-var(--linear-content-max))/2+1.25rem))] pr-[9vw] scroll-pl-[max(1.25rem,calc((100vw-var(--linear-content-max))/2+1.25rem))] [-ms-overflow-style:none] [scrollbar-width:none] scrollbar-hide sm:gap-4 sm:pl-[max(1.5rem,calc((100vw-var(--linear-content-max))/2+1.5rem))] sm:pr-[10vw] sm:scroll-pl-[max(1.5rem,calc((100vw-var(--linear-content-max))/2+1.5rem))] lg:pl-[max(1.5rem,calc((100vw-var(--linear-content-max))/2))] lg:pr-[12vw] lg:scroll-pl-[max(1.5rem,calc((100vw-var(--linear-content-max))/2))] [&::-webkit-scrollbar]:hidden'
          >
            <button
              type='button'
              onClick={() => {
                scrollByDirection('next');
              }}
              className='sr-only focus:not-sr-only focus:absolute focus:left-[max(1.25rem,calc((100vw-var(--linear-content-max))/2+1.25rem))] focus:top-4 focus:z-30 focus:rounded-full focus:border focus:border-black/12 focus:bg-[#f3efe6] focus:px-4 focus:py-2 focus:text-[12px] focus:font-semibold focus:text-black focus:shadow-[0_18px_42px_rgba(0,0,0,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15'
            >
              Browse monetization cards
            </button>
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
                aria-label='Scroll monetization left'
              >
                <ChevronLeft className='h-4 w-4' />
              </button>
              <button
                type='button'
                onClick={() => {
                  scrollByDirection('next');
                }}
                disabled={activeCardIndex === cards.length - 1}
                className={cn(
                  'pointer-events-auto rounded-full border border-white/10 bg-black/62 p-2.5 text-white shadow-[0_18px_44px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-colors',
                  activeCardIndex === cards.length - 1
                    ? 'cursor-not-allowed opacity-35'
                    : 'hover:bg-white hover:text-black'
                )}
                aria-label='Scroll monetization right'
              >
                <ChevronRight className='h-4 w-4' />
              </button>
            </div>
            {cards.map((card, index) => (
              <MonetizationCard
                key={card.id}
                ref={node => {
                  cardRefs.current[index] = node;
                }}
                cardId={card.id}
                body={card.body}
                textAnchor={card.textAnchor}
                title={card.title}
                visualSide={card.visualSide}
              >
                {card.id === 'irl-payments' ? (
                  <IrlPaymentsVisual card={monetization.irlPaymentsCard} />
                ) : null}
                {card.id === 'capture' ? (
                  <CaptureFanVisual card={monetization.captureCard} />
                ) : null}
                {card.id === 'thanks' ? (
                  <SayThanksVisual card={monetization.thanksCard} />
                ) : null}
                {card.id === 'reengage' ? (
                  <ReengageVisual card={monetization.reengageCard} />
                ) : null}
              </MonetizationCard>
            ))}
          </section>
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}

interface MonetizationCardProps {
  readonly cardId: MonetizationCardId;
  readonly body: string;
  readonly children: ReactNode;
  readonly textAnchor: 'top' | 'bottom';
  readonly title: string;
  readonly visualSide: 'left' | 'right';
}

const MonetizationCard = forwardRef<HTMLElement, MonetizationCardProps>(
  function MonetizationCard(
    {
      cardId,
      body,
      children,
      textAnchor,
      title,
      visualSide,
    }: Readonly<MonetizationCardProps>,
    ref
  ) {
    const isIrlPaymentsCard = cardId === 'irl-payments';
    const isCaptureCard = cardId === 'capture';

    const textBlock = (
      <div
        className={cn(
          'relative z-10 max-w-[17rem]',
          textAnchor === 'top'
            ? 'self-start text-left'
            : 'self-end text-right sm:max-w-[15.5rem]'
        )}
      >
        <h3 className='text-[1.4rem] font-semibold leading-[1.02] tracking-[-0.05em] text-black'>
          {title}
        </h3>
        <p className='mt-3 text-[13px] leading-[1.58] tracking-[-0.02em] text-black/62'>
          {body}
        </p>
      </div>
    );

    const visualBlock = (
      <div
        className={cn(
          'relative z-10',
          visualSide === 'right' ? 'self-end' : 'self-start',
          isIrlPaymentsCard &&
            '-mb-5 -mr-5 sm:-mb-6 sm:-mr-6 lg:-mb-6.5 lg:-mr-6.5'
        )}
      >
        {children}
      </div>
    );

    return (
      <article
        ref={ref}
        data-testid='artist-profile-monetization-card'
        className={cn(
          'relative flex w-[min(22rem,82vw)] shrink-0 snap-start flex-col overflow-hidden rounded-[1.45rem] bg-[#f3efe6] p-5 text-black shadow-[0_22px_64px_rgba(0,0,0,0.26)] sm:w-[25rem] sm:p-6 lg:w-[27rem] lg:p-6.5',
          isCaptureCard
            ? 'min-h-[22.75rem] sm:min-h-[23.75rem] lg:min-h-[24.5rem]'
            : 'min-h-[27rem] sm:min-h-[29rem] lg:min-h-[30rem]'
        )}
      >
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-[1.45rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.7),transparent)]'
        />
        {textAnchor === 'top' ? textBlock : visualBlock}
        <div className='flex-1' />
        {textAnchor === 'top' ? visualBlock : textBlock}
      </article>
    );
  }
);

function IrlPaymentsVisual({}: Readonly<{
  card: ArtistProfileLandingCopy['monetization']['irlPaymentsCard'];
}>) {
  return (
    <div className='relative h-[13.8rem] w-[18rem] overflow-hidden rounded-t-[1.45rem] rounded-b-none bg-[#0d1015] shadow-[0_-20px_48px_rgba(0,0,0,0.24)] sm:h-[14.5rem] sm:w-[19rem]'>
      <Image
        alt='Pay drawer open inside an artist profile payment flow'
        className='object-cover object-bottom'
        fill
        sizes='(max-width: 640px) 18rem, 19rem'
        src='/product-screenshots/tim-white-profile-pay-phone.png'
      />
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 h-12 bg-[linear-gradient(180deg,rgba(13,16,21,0.06),transparent)]'
      />
    </div>
  );
}

function CaptureFanVisual({
  card,
}: Readonly<{
  card: ArtistProfileLandingCopy['monetization']['captureCard'];
}>) {
  return (
    <div className='w-[14.75rem] rounded-[1.15rem] bg-[#0f131a] px-4 py-3.5 text-white shadow-[0_20px_40px_rgba(0,0,0,0.18)]'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <p className='text-[14px] font-semibold tracking-[-0.03em] text-white'>
            {card.fanName}
          </p>
          <div className='mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-white/72'>
            <MapPin className='h-3.5 w-3.5' strokeWidth={1.9} />
            {card.fanLocation}
          </div>
        </div>
        <div className='rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-black'>
          {card.fanAmount}
        </div>
      </div>
      <div className='mt-3 rounded-[0.95rem] bg-white/[0.06] px-3 py-2.5'>
        <p className='text-[12px] font-medium tracking-[-0.02em] text-white/76'>
          {card.fanIntent}
        </p>
      </div>
      <div className='mt-2.5 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.25 text-[10.5px] font-semibold text-white/74'>
        New music notifications enabled
      </div>
    </div>
  );
}

function SayThanksVisual({
  card,
}: Readonly<{
  card: ArtistProfileLandingCopy['monetization']['thanksCard'];
}>) {
  return (
    <div className='w-[15rem] rounded-[1.1rem] bg-[#0f131a] p-3.5 text-white shadow-[0_18px_34px_rgba(0,0,0,0.16)]'>
      <div className='flex items-start gap-3'>
        <span className='mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-white'>
          <Mail className='h-4 w-4' strokeWidth={1.9} />
        </span>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center justify-between gap-3'>
            <p className='text-[12px] font-semibold tracking-[-0.02em] text-white'>
              {card.appName}
            </p>
            <p className='text-[11px] font-medium text-white/72'>now</p>
          </div>
          <p className='mt-0.5 text-[11px] font-medium text-white/72'>
            {card.sender}
          </p>
          <p className='mt-3 text-[13px] font-semibold leading-[1.28] tracking-[-0.03em] text-white'>
            {card.notificationTitle}
          </p>
          <p className='mt-1.5 text-[12px] leading-[1.45] text-white/74'>
            {card.notificationPreview}
          </p>
        </div>
      </div>
    </div>
  );
}

function getOutputTransform(index: number): string {
  if (index === 0) return 'translateX(0px)';
  if (index === 1) return 'translateX(10px)';
  return 'translateX(20px)';
}

function ReengageVisual({
  card,
}: Readonly<{
  card: ArtistProfileLandingCopy['monetization']['reengageCard'];
}>) {
  const iconMap = {
    payment: CircleDollarSign,
    thanks: Mail,
    spotify: Music2,
  } as const;

  return (
    <div className='relative w-[15.75rem]'>
      {card.outputs.map((output, index) => {
        const Icon = iconMap[output.id];
        return (
          <div
            key={output.id}
            className={cn(
              'relative rounded-[1rem] bg-[#0d1015] px-3.5 py-3.5 text-white shadow-[0_14px_30px_rgba(0,0,0,0.18)]',
              index > 0 && 'mt-2.5'
            )}
            style={{
              transform: getOutputTransform(index),
            }}
          >
            <div className='flex items-start gap-3'>
              <span className='mt-0.5 inline-flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/88'>
                <Icon className='h-4 w-4' strokeWidth={1.9} />
              </span>
              <div className='min-w-0'>
                <p className='text-[12.5px] font-semibold leading-[1.3] tracking-[-0.02em] text-white'>
                  {output.title}
                </p>
                <p className='mt-1.5 text-[11.5px] leading-[1.45] text-white/72'>
                  {output.detail}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
