'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
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

    const delta = direction === 'next' ? 360 : -360;
    scroller.scrollBy({
      left: delta,
      behavior: 'smooth',
    });
  };

  return (
    <ArtistProfileSectionShell className='bg-white/[0.01]' width='page'>
      <div className='mx-auto max-w-[1120px]'>
        <div className='flex items-end justify-between gap-6'>
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
          className='relative mt-10 flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2 pr-[12vw] [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-5 sm:pr-[18vw] lg:pr-[22vw] [&::-webkit-scrollbar]:hidden'
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
    flex: '0 0 min(84vw, 62rem)',
  };
  const proof = outcomes.syntheticProofs;

  return (
    <article
      className='group relative flex min-h-[34rem] snap-start flex-col overflow-hidden rounded-[1.9rem] bg-[#050505]'
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

      <div className='relative flex h-full flex-col p-6 sm:p-7'>
        <div className='min-w-0'>
          <h3 className='max-w-[10ch] text-[clamp(2.85rem,5vw,4.9rem)] font-semibold leading-[0.9] tracking-[-0.08em] text-primary-token'>
            {card.title}
          </h3>
          <p className='mt-4 max-w-[25rem] text-[15px] leading-[1.55] text-secondary-token'>
            {card.description}
          </p>
        </div>

        <div className='mt-auto pt-10'>
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
    <div className='relative h-[20.5rem] overflow-hidden rounded-[1.45rem] bg-black/32 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]'>
      <div className='absolute left-5 top-5 z-20 w-[15rem] rounded-[1.35rem] border border-white/8 bg-[#0d0d0d]/92 p-4 text-left shadow-[0_18px_40px_rgba(0,0,0,0.3)] backdrop-blur-md'>
        <p className='text-[11px] font-semibold uppercase tracking-[0.12em] text-white/48'>
          {proof.floatingCardLabel}
        </p>
        <p className='mt-3 text-[1.35rem] font-semibold leading-[1.02] tracking-[-0.05em] text-white'>
          {proof.floatingCardTitle}
        </p>
        <p className='mt-1 text-[12px] font-medium text-white/64'>
          {proof.artistName}
        </p>
        <div className='mt-4 flex items-center justify-between gap-3'>
          <span className='rounded-full bg-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-white/84'>
            {proof.floatingCardMeta}
          </span>
          <span className='rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-black'>
            {proof.primaryCtaLabel}
          </span>
        </div>
      </div>

      <Image
        src={proof.screenshotSrc}
        alt={proof.screenshotAlt}
        width={660}
        height={1368}
        sizes='240px'
        className='absolute bottom-[-6.4rem] right-4 w-[14rem] max-w-none rounded-[2.25rem] shadow-[0_28px_70px_rgba(0,0,0,0.42)] sm:right-6 sm:w-[15.5rem]'
      />
    </div>
  );
}

function SellOutProof({
  proof,
}: Readonly<{
  proof: ArtistProfileLandingCopy['outcomes']['syntheticProofs']['visualProofs']['sellOut'];
}>) {
  return (
    <div className='relative h-[21rem] overflow-hidden rounded-[1.45rem] bg-black/34 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]'>
      <div className='absolute left-5 top-5 z-20 w-[13rem] rounded-[1.3rem] bg-[#f7f6f1] p-4 text-black shadow-[0_18px_45px_rgba(0,0,0,0.24)]'>
        <p className='text-[11px] font-semibold uppercase tracking-[0.12em] text-black/62'>
          {proof.nearbyCardLabel}
        </p>
        <p className='mt-3 text-[1.8rem] font-semibold leading-none tracking-[-0.07em]'>
          {proof.nearbyDate}
        </p>
        <p className='mt-3 text-[1rem] font-semibold leading-[1.1] tracking-[-0.03em]'>
          {proof.nearbyVenue}
        </p>
        <p className='mt-1 text-[12px] leading-[1.35] text-black/56'>
          {proof.nearbyLocation}
        </p>
        <span className='mt-4 inline-flex rounded-full bg-black px-3 py-1.5 text-[11px] font-semibold text-white'>
          {proof.nearbyCtaLabel}
        </span>
      </div>

      <div className='absolute inset-x-5 bottom-5 z-20 max-w-[23rem] rounded-[1.3rem] border border-white/8 bg-[#0f0f0f]/94 p-4 text-left shadow-[0_18px_45px_rgba(0,0,0,0.26)] backdrop-blur-md'>
        <p className='text-[14px] font-semibold tracking-[-0.03em] text-white'>
          {proof.drawerTitle}
        </p>
        <p className='mt-1 text-[12px] text-white/48'>{proof.drawerSubtitle}</p>
        <div className='mt-4 space-y-2.5'>
          {proof.drawerRows.map(row => (
            <div
              key={row.id}
              className='grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 rounded-[1rem] bg-white/[0.04] px-3 py-3'
            >
              <span className='rounded-[0.85rem] bg-white/[0.06] px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-white/64'>
                {row.month}
                <span className='mt-0.5 block text-[18px] leading-none tracking-[-0.05em] text-white'>
                  {row.day}
                </span>
              </span>
              <span className='min-w-0'>
                <span className='block truncate text-[13px] font-semibold text-white'>
                  {row.venue}
                </span>
                <span className='block truncate text-[11px] text-white/48'>
                  {row.location}
                </span>
              </span>
              <span className='rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/84'>
                {row.ctaLabel}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Image
        src={proof.screenshotSrc}
        alt={proof.screenshotAlt}
        width={660}
        height={1368}
        sizes='220px'
        className='absolute right-[-1rem] top-3 w-[11.5rem] max-w-none rounded-[2rem] opacity-90 shadow-[0_24px_60px_rgba(0,0,0,0.4)] sm:right-0 sm:w-[12.5rem]'
      />
    </div>
  );
}

function GetPaidProof({
  proof,
}: Readonly<{
  proof: ArtistProfileLandingCopy['outcomes']['syntheticProofs']['visualProofs']['getPaid'];
}>) {
  return (
    <div className='relative h-[21rem] overflow-hidden rounded-[1.45rem] bg-black/34 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]'>
      <Image
        src={proof.screenshotSrc}
        alt={proof.screenshotAlt}
        width={660}
        height={1368}
        sizes='240px'
        className='absolute right-1 top-1 w-[13rem] max-w-none rounded-[2rem] opacity-78 shadow-[0_24px_60px_rgba(0,0,0,0.36)] sm:right-3 sm:w-[14.25rem]'
      />

      <div className='absolute inset-x-5 bottom-5 z-20 rounded-[1.45rem] border border-white/8 bg-[#111]/96 px-4 pb-4 pt-3 text-white shadow-[0_24px_60px_rgba(0,0,0,0.28)] backdrop-blur-md'>
        <div className='mx-auto mb-4 h-1 w-10 rounded-full bg-white/18' />
        <p className='text-[15px] font-semibold tracking-[-0.03em] text-white/92'>
          {proof.drawerTitle}
        </p>
        <p className='mt-1 text-[12px] text-white/48'>{proof.drawerSubtitle}</p>
        <p className='mt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/64'>
          {proof.chooseAmountLabel}
        </p>
        <div className='mt-3 grid grid-cols-3 gap-2.5'>
          {proof.amountRows.map(row => (
            <div
              key={row.id}
              className='rounded-[1rem] border px-2.5 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
              style={{
                background: row.featured
                  ? 'rgba(255,255,255,0.95)'
                  : 'rgba(255,255,255,0.06)',
                borderColor: row.featured
                  ? 'rgba(255,255,255,0.7)'
                  : 'rgba(255,255,255,0.08)',
                color: row.featured ? '#111' : 'rgba(255,255,255,0.92)',
              }}
            >
              <p className='text-[10px] font-semibold uppercase tracking-[0.08em] opacity-64'>
                {row.currency}
              </p>
              <p className='mt-2 text-[1.75rem] font-semibold leading-none tracking-[-0.07em]'>
                {row.amount}
              </p>
            </div>
          ))}
        </div>
        <div className='mt-4 rounded-full bg-white px-4 py-3 text-center text-[13px] font-semibold tracking-[-0.02em] text-black'>
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
    <div className='mx-auto flex min-h-[20rem] w-full max-w-[22rem] flex-col items-center justify-center rounded-[1.6rem] bg-[#fbfaf6] px-6 py-7 text-center text-black shadow-[0_24px_60px_rgba(0,0,0,0.24)]'>
      <p className='text-[12px] font-semibold tracking-[0.02em] text-black/72'>
        {proof.title}
      </p>
      <div className='relative mt-6'>
        <div className='absolute inset-x-8 -top-5 h-10 rounded-full bg-black/10 blur-2xl' />
        <div className='relative rounded-[1.75rem] bg-white p-4 shadow-[0_20px_40px_rgba(0,0,0,0.14)]'>
          <div className='grid grid-cols-7 gap-[6px]'>
            {QR_CELLS.map(cell => (
              <span
                key={cell.id}
                className='h-3.5 w-3.5 rounded-[3px]'
                style={{
                  backgroundColor: cell.filled ? '#0b0b0b' : '#f2f0ea',
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <p className='mt-5 font-mono text-[13px] font-semibold tracking-[-0.02em] text-black'>
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
