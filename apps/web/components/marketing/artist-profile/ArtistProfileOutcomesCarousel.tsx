'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useRef } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileOutcomesCarouselProps {
  readonly outcomes: ArtistProfileLandingCopy['outcomes'];
}

type OutcomeId = ArtistProfileLandingCopy['outcomes']['cards'][number]['id'];

const OUTCOME_CARD_ACCENTS: Record<OutcomeId, string> = {
  'drive-streams': 'var(--color-accent-teal)',
  'sell-out': 'var(--color-accent-blue)',
  'get-paid': 'var(--color-accent-green)',
  'share-anywhere': 'var(--color-accent-orange)',
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

    const delta =
      (direction === 'next' ? 1 : -1) * Math.round(scroller.clientWidth * 0.92);
    scroller.scrollBy({
      left: delta,
      behavior: 'smooth',
    });
  };

  return (
    <ArtistProfileSectionShell
      className='bg-white/[0.01]'
      containerClassName='max-w-none px-0'
      width='page'
    >
      <div>
        <div className='mx-auto flex max-w-[1120px] items-end justify-between gap-6 px-5 sm:px-6 lg:px-8'>
          <div>
            <h2 className='max-w-[9ch] text-[clamp(3.35rem,7vw,6.9rem)] font-semibold leading-[0.88] tracking-[-0.08em] text-primary-token'>
              {outcomes.headline}
            </h2>
            {outcomes.body ? (
              <p className='mt-5 max-w-[34rem] text-[15px] leading-[1.7] text-secondary-token'>
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
              className='rounded-full bg-white/[0.03] p-2 text-secondary-token transition-colors hover:bg-white/[0.08] hover:text-primary-token'
              aria-label='Scroll outcomes left'
            >
              <ChevronLeft className='h-4 w-4' />
            </button>
            <button
              type='button'
              onClick={() => {
                scrollByAmount('next');
              }}
              className='rounded-full bg-white/[0.03] p-2 text-secondary-token transition-colors hover:bg-white/[0.08] hover:text-primary-token'
              aria-label='Scroll outcomes right'
            >
              <ChevronRight className='h-4 w-4' />
            </button>
          </div>
        </div>

        <div
          ref={scrollerRef}
          data-testid='artist-profile-outcomes-scroller'
          className='relative left-1/2 mt-10 flex w-screen -translate-x-1/2 gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2 pl-[max(1.25rem,calc((100vw-1120px)/2+1.25rem))] pr-[10vw] [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-5 sm:pl-[max(1.5rem,calc((100vw-1120px)/2+1.5rem))] sm:pr-[12vw] lg:pl-[max(2rem,calc((100vw-1120px)/2+2rem))] lg:pr-[14vw] [&::-webkit-scrollbar]:hidden'
        >
          <button
            type='button'
            onClick={() => {
              scrollByAmount('next');
            }}
            className='sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-full focus:bg-white focus:px-3 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-black'
          >
            Scroll outcomes
          </button>
          {outcomes.cards.map(card => (
            <OutcomeCard key={card.id} card={card} outcomes={outcomes} />
          ))}
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}

function OutcomeCard({
  card,
  outcomes,
}: Readonly<{
  card: ArtistProfileLandingCopy['outcomes']['cards'][number];
  outcomes: ArtistProfileLandingCopy['outcomes'];
}>) {
  const style: OutcomeAccentStyle = {
    '--outcome-accent': OUTCOME_CARD_ACCENTS[card.id],
    flex: '0 0 clamp(22rem, 82vw, 58rem)',
  };
  const proof = outcomes.syntheticProofs;

  return (
    <article
      data-testid='artist-profile-outcome-card'
      className='group relative flex min-h-[32rem] snap-start flex-col overflow-hidden rounded-[1.9rem] bg-[#050505] sm:min-h-[33rem] lg:min-h-[34rem] xl:min-h-[35rem]'
      style={style}
    >
      <div
        className='absolute inset-0 opacity-80'
        style={{
          background:
            'radial-gradient(circle at 72% 78%, color-mix(in srgb, var(--outcome-accent) 14%, transparent), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.014) 44%, rgba(0,0,0,0.42))',
        }}
        aria-hidden='true'
      />

      <div className='relative flex h-full flex-col p-6 sm:p-7 lg:p-8'>
        <div className='min-w-0'>
          <h3 className='max-w-[10ch] text-[clamp(2.8rem,4.8vw,4.75rem)] font-semibold leading-[0.9] tracking-[-0.08em] text-primary-token'>
            {card.title}
          </h3>
          <p className='mt-4 max-w-[22rem] text-[14px] leading-[1.65] text-secondary-token'>
            {card.description}
          </p>
        </div>

        <div className='mt-auto pt-12 sm:pt-14'>
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
}

function DriveStreamsProof({
  proof,
}: Readonly<{
  proof: ArtistProfileLandingCopy['outcomes']['syntheticProofs']['visualProofs']['driveStreams'];
}>) {
  return (
    <div className='max-w-[23rem] rounded-[1.45rem] border border-white/8 bg-black/32 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] sm:p-5'>
      <div className='border-b border-white/8 pb-4'>
        <p className='text-[11px] font-medium tracking-[-0.01em] text-white/48'>
          {proof.floatingCardLabel}
        </p>
        <p className='mt-3 text-[1.3rem] font-semibold leading-[1.06] tracking-[-0.04em] text-white'>
          {proof.floatingCardTitle}
        </p>
        <p className='mt-1 text-[12px] font-medium text-white/64'>
          {proof.artistName}
        </p>
      </div>

      <div className='divide-y divide-white/8 py-2'>
        <div className='flex items-center justify-between gap-4 py-3 text-[12px] text-white/62'>
          <span>Status</span>
          <span className='text-white/86'>{proof.floatingCardMeta}</span>
        </div>
        <div className='flex items-center justify-between gap-4 py-3 text-[12px] text-white/62'>
          <span>CTA</span>
          <span className='text-white/86'>{proof.primaryCtaLabel}</span>
        </div>
        <div className='flex items-center justify-between gap-4 py-3 text-[12px] text-white/62'>
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
    <div className='max-w-[26rem] rounded-[1.45rem] border border-white/8 bg-black/34 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] sm:p-5'>
      <div className='flex items-end justify-between gap-4 border-b border-white/8 pb-4'>
        <div>
          <p className='text-[11px] font-medium tracking-[-0.01em] text-white/64'>
            {proof.nearbyCardLabel}
          </p>
          <p className='mt-2 text-[1.3rem] font-semibold leading-none tracking-[-0.04em] text-white'>
            {proof.nearbyDate}
          </p>
          <p className='mt-2 text-[14px] font-semibold tracking-[-0.02em] text-white/88'>
            {proof.nearbyVenue}
          </p>
          <p className='mt-1 text-[11px] text-white/64'>
            {proof.nearbyLocation}
          </p>
        </div>
        <span className='rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/84'>
          {proof.nearbyCtaLabel}
        </span>
      </div>

      <div className='pt-4'>
        <p className='text-[12px] font-semibold tracking-[-0.02em] text-white'>
          {proof.drawerTitle}
        </p>
        <p className='mt-1 text-[11px] text-white/48'>{proof.drawerSubtitle}</p>
        <div className='mt-4 divide-y divide-white/8'>
          {proof.drawerRows.map(row => (
            <div
              key={row.id}
              className='grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 py-3'
            >
              <span className='text-[11px] font-medium tracking-[-0.01em] text-white/56'>
                {row.month} {row.day}
              </span>
              <span className='min-w-0'>
                <span className='block truncate text-[13px] font-semibold text-white'>
                  {row.venue}
                </span>
                <span className='block truncate text-[11px] text-white/48'>
                  {row.location}
                </span>
              </span>
              <span className='text-[11px] font-medium text-white/72'>
                {row.ctaLabel}
              </span>
            </div>
          ))}
        </div>
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
    <div className='max-w-[24rem] rounded-[1.45rem] border border-white/8 bg-black/34 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] sm:p-5'>
      <div className='border-b border-white/8 pb-4'>
        <p className='text-[14px] font-semibold tracking-[-0.03em] text-white/92'>
          {proof.drawerTitle}
        </p>
        <p className='mt-1 text-[11px] text-white/48'>{proof.drawerSubtitle}</p>
      </div>

      <div className='pt-4'>
        <p className='text-[10px] font-medium tracking-[-0.01em] text-white/64'>
          {proof.chooseAmountLabel}
        </p>
        <div className='mt-3 grid grid-cols-3 divide-x divide-white/8 rounded-[1rem] border border-white/8 bg-white/[0.03]'>
          {proof.amountRows.map(row => (
            <div
              key={row.id}
              className='px-3 py-2 text-center'
              style={{
                background: row.featured
                  ? 'rgba(255,255,255,0.95)'
                  : 'transparent',
                color: row.featured ? '#111' : 'rgba(255,255,255,0.92)',
              }}
            >
              <p className='text-[9px] font-medium tracking-[-0.01em] opacity-64'>
                {row.currency}
              </p>
              <p className='mt-1.5 text-[1.35rem] font-semibold leading-none tracking-[-0.05em]'>
                {row.amount}
              </p>
            </div>
          ))}
        </div>
        <div className='mt-4 rounded-full bg-white px-4 py-2.5 text-center text-[12px] font-semibold tracking-[-0.02em] text-black'>
          {proof.ctaLabel}
        </div>
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
    <div className='mx-auto flex min-h-[18rem] w-full max-w-[18rem] flex-col items-center justify-center rounded-[1.6rem] bg-[#fbfaf6] px-5 py-6 text-center text-black shadow-[0_24px_60px_rgba(0,0,0,0.24)]'>
      <p className='text-[11px] font-semibold tracking-[0.02em] text-black/72'>
        {proof.title}
      </p>
      <div className='relative mt-5'>
        <div className='absolute inset-x-8 -top-5 h-10 rounded-full bg-black/10 blur-2xl' />
        <div className='relative rounded-[1.5rem] bg-white p-3 shadow-[0_20px_40px_rgba(0,0,0,0.14)]'>
          <div className='grid grid-cols-7 gap-[6px]'>
            {QR_CELLS.map(cell => (
              <span
                key={cell.id}
                className='h-3 w-3 rounded-[3px]'
                style={{
                  backgroundColor: cell.filled ? '#0b0b0b' : '#f2f0ea',
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <p className='mt-4 font-mono text-[12px] font-semibold tracking-[-0.02em] text-black'>
        {proof.url}
      </p>
      <p className='mt-2 text-[12px] font-medium text-black/64'>
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
