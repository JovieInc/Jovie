'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import type { CSSProperties } from 'react';
import { useId, useRef } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import {
  HOMEPAGE_PROFILE_PREVIEW_ARTIST,
  HOMEPAGE_PROFILE_PREVIEW_RELEASES,
  HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES,
} from '@/features/home/homepage-profile-preview-fixture';
import { ProfilePrimaryActionCard } from '@/features/profile/ProfilePrimaryActionCard';
import { getAccentCssVars } from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';
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

// Per-card widths. Horizontal rail lets each outcome take the room its
// mockup actually needs. Drive streams and Sell out need side-by-side
// proofs, so they get wider slots; Share anywhere is a single QR card
// and can stay narrow.
const OUTCOME_CARD_WIDTHS: Record<OutcomeId, string> = {
  'drive-streams': 'w-[85vw] sm:w-[34rem] lg:w-[38rem]',
  'sell-out': 'w-[85vw] sm:w-[36rem] lg:w-[40rem]',
  'get-paid': 'w-[85vw] sm:w-[30rem] lg:w-[32rem]',
  'share-anywhere': 'w-[85vw] sm:w-[24rem] lg:w-[26rem]',
};

type OutcomeAccentStyle = CSSProperties & {
  readonly '--outcome-accent': string;
};

const SHOWCASE_VIEWER_LOCATION = {
  latitude: 34.0522,
  longitude: -118.2437,
} as const;

export function ArtistProfileOutcomesCarousel({
  outcomes,
}: Readonly<ArtistProfileOutcomesCarouselProps>) {
  const railId = useId();
  const scrollerRef = useRef<HTMLElement | null>(null);

  const scrollByDirection = (direction: 'prev' | 'next') => {
    const rail = scrollerRef.current;
    if (!rail) {
      return;
    }

    const scrollStep = Math.max(rail.clientWidth * 0.8, 240);
    const nextLeft = direction === 'next' ? scrollStep : -scrollStep;

    rail.scrollBy({ left: nextLeft, behavior: 'smooth' });
  };

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

        <div
          data-testid='artist-profile-outcomes-scroller'
          className='hidden'
          aria-hidden='true'
        />

        <p id='artist-profile-outcomes-instructions' className='sr-only'>
          Use the previous and next controls to browse the outcome cards.
        </p>

        <div className='relative mt-10 w-full overflow-x-hidden'>
          <div className='pointer-events-none absolute right-[max(1.25rem,calc((100vw-var(--linear-content-max))/2))] top-4 z-20 hidden items-center gap-2 lg:flex'>
            <button
              type='button'
              aria-controls={railId}
              aria-label='Scroll outcomes left'
              onClick={() => {
                scrollByDirection('prev');
              }}
              className='pointer-events-auto rounded-full border border-white/10 bg-black/62 p-2.5 text-white shadow-[0_18px_44px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-colors hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-black'
            >
              <ChevronLeft className='h-4 w-4' aria-hidden='true' />
            </button>
            <button
              type='button'
              aria-controls={railId}
              aria-label='Scroll outcomes right'
              onClick={() => {
                scrollByDirection('next');
              }}
              className='pointer-events-auto rounded-full border border-white/10 bg-black/62 p-2.5 text-white shadow-[0_18px_44px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-colors hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-black'
            >
              <ChevronRight className='h-4 w-4' aria-hidden='true' />
            </button>
          </div>

          <div className='sr-only focus-within:not-sr-only focus-within:absolute focus-within:left-5 focus-within:top-4 focus-within:z-20 focus-within:flex focus-within:gap-2 sm:focus-within:left-6 lg:hidden'>
            <button
              type='button'
              aria-controls={railId}
              aria-label='Scroll outcomes left'
              onClick={() => {
                scrollByDirection('prev');
              }}
              className='rounded-full border border-black/12 bg-[#f3efe6] px-3 py-2 text-[12px] font-semibold text-black shadow-[0_18px_42px_rgba(0,0,0,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15'
            >
              Prev
            </button>
            <button
              type='button'
              aria-controls={railId}
              aria-label='Scroll outcomes right'
              onClick={() => {
                scrollByDirection('next');
              }}
              className='rounded-full border border-black/12 bg-[#f3efe6] px-3 py-2 text-[12px] font-semibold text-black shadow-[0_18px_42px_rgba(0,0,0,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15'
            >
              Next
            </button>
          </div>

          <section
            ref={scrollerRef}
            id={railId}
            data-testid='artist-profile-outcomes-grid'
            aria-label='Outcome showcase'
            aria-describedby='artist-profile-outcomes-instructions'
            className='relative flex gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth snap-x snap-mandatory pb-3 pl-5 pr-[10vw] scroll-pl-5 sm:gap-3.5 sm:pl-6 sm:pr-[12vw] sm:scroll-pl-6 lg:pl-[max(1.5rem,calc((100vw-var(--linear-content-max))/2))] lg:pr-[14vw] lg:scroll-pl-[max(1.5rem,calc((100vw-var(--linear-content-max))/2))] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          >
            {outcomes.cards.map(card => (
              <OutcomeCard key={card.id} card={card} outcomes={outcomes} />
            ))}
          </section>
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
  };

  const proof = outcomes.syntheticProofs;

  return (
    <article
      data-testid='artist-profile-outcome-card'
      className={cn(
        'group relative flex shrink-0 snap-start flex-col overflow-hidden rounded-[1.5rem] border border-white/8 bg-[#050505] shadow-[0_22px_56px_rgba(0,0,0,0.28)]',
        OUTCOME_CARD_WIDTHS[card.id]
      )}
      style={style}
    >
      <div
        className='absolute inset-0 opacity-90'
        style={{
          background:
            'radial-gradient(circle at 80% 78%, color-mix(in srgb, var(--outcome-accent) 18%, transparent), transparent 36%), linear-gradient(145deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015) 44%, rgba(0,0,0,0.42))',
        }}
        aria-hidden='true'
      />
      <div className='relative flex h-full flex-col p-4 sm:p-5'>
        <div className='max-w-[18rem]'>
          <h3 className='max-w-[10ch] text-[clamp(1.85rem,3.4vw,3rem)] font-semibold leading-[0.92] tracking-[-0.065em] text-primary-token'>
            {card.title}
          </h3>
        </div>

        <div className='mt-4'>
          {card.id === 'drive-streams' ? <DriveStreamsProof /> : null}
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

const SHOWCASE_NOW = new Date('2026-04-20T12:00:00.000Z');

function DriveStreamsProof() {
  return (
    <div className='grid gap-2 sm:grid-cols-[1.02fr_0.98fr]'>
      <div className='sm:pt-4'>
        <ProfilePrimaryActionCard
          artist={HOMEPAGE_PROFILE_PREVIEW_ARTIST}
          latestRelease={HOMEPAGE_PROFILE_PREVIEW_RELEASES.live}
          profileSettings={{ showOldReleases: true }}
          tourDates={[]}
          hasPlayableDestinations={true}
          renderMode='preview'
          previewActionLabel='Listen'
          size='showcase'
          now={SHOWCASE_NOW}
          className='w-full'
          dataTestId='artist-profile-drive-streams-live-card'
        />
      </div>
      <div className='sm:-mb-2'>
        <ProfilePrimaryActionCard
          artist={HOMEPAGE_PROFILE_PREVIEW_ARTIST}
          latestRelease={HOMEPAGE_PROFILE_PREVIEW_RELEASES.presave}
          profileSettings={{ showOldReleases: true }}
          tourDates={[]}
          hasPlayableDestinations={true}
          renderMode='preview'
          previewActionLabel='Listen'
          size='showcase'
          now={SHOWCASE_NOW}
          className='w-full'
          dataTestId='artist-profile-drive-streams-presave-card'
        />
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
    <div className='grid gap-2 sm:grid-cols-[0.9fr_1.1fr]'>
      <div className='sm:pt-4'>
        <ProfilePrimaryActionCard
          artist={HOMEPAGE_PROFILE_PREVIEW_ARTIST}
          latestRelease={null}
          profileSettings={{ showOldReleases: true }}
          tourDates={HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES}
          hasPlayableDestinations={false}
          renderMode='preview'
          size='showcase'
          viewerLocation={SHOWCASE_VIEWER_LOCATION}
          now={SHOWCASE_NOW}
          className='w-full'
          dataTestId='artist-profile-sell-out-tour-card'
        />
      </div>

      <div className='flex h-full flex-col rounded-[1.08rem] border border-white/8 bg-white/[0.02] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'>
        <p className='text-[12px] font-semibold tracking-[-0.02em] text-white'>
          {proof.drawerTitle}
        </p>
        <p className='mt-1 text-[11px] text-white/44'>{proof.drawerSubtitle}</p>
        <div className='mt-2.5 divide-y divide-white/6'>
          {proof.drawerRows.map(row => (
            <div
              key={row.id}
              className='grid grid-cols-[2.45rem_minmax(0,1fr)_auto] items-center gap-2 py-2.25'
            >
              <span className='text-[11px] font-medium leading-[1.15] tracking-[-0.01em] text-white/52'>
                {row.month}
                <span className='block text-[14px] font-semibold tracking-[-0.04em] text-white'>
                  {row.day}
                </span>
              </span>
              <span className='min-w-0'>
                <span className='block truncate text-[12.5px] font-semibold text-white'>
                  {row.venue}
                </span>
                <span className='block truncate text-[11px] text-white/44'>
                  {row.location}
                </span>
              </span>
              <span className='text-[11px] font-medium text-white/64'>
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
    <div className='grid gap-2 sm:grid-cols-[0.9fr_1.1fr]'>
      <div className='flex flex-col justify-between rounded-[1.08rem] border border-white/8 bg-white/[0.02] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:pt-3.5'>
        <div>
          <p className='text-[11px] font-medium tracking-[-0.01em] text-white/48'>
            {proof.drawerTitle}
          </p>
          <p className='mt-1 text-[13px] font-semibold tracking-[-0.03em] text-white'>
            {proof.drawerSubtitle}
          </p>
        </div>

        <div className='mt-3 space-y-1.5'>
          <p className='text-[11px] font-medium tracking-[-0.01em] text-white/48'>
            {proof.chooseAmountLabel}
          </p>
          <div className='grid gap-1.5'>
            {proof.amountRows.map(row => (
              <div
                key={row.id}
                className={cn(
                  'flex items-center justify-between rounded-[0.82rem] border px-3 py-1.75 text-[12px]',
                  row.featured
                    ? 'border-white/18 bg-white text-black'
                    : 'border-white/8 bg-white/[0.03] text-white'
                )}
              >
                <span className='font-semibold tracking-[-0.02em]'>
                  {row.amount}
                </span>
                <span
                  className={cn(
                    'text-[10px] font-medium',
                    row.featured ? 'text-black/62' : 'text-white/52'
                  )}
                >
                  {row.currency}
                </span>
              </div>
            ))}
          </div>
        </div>

        <span className='mt-3 inline-flex w-fit rounded-full bg-white px-3.5 py-2 text-[11px] font-semibold text-black'>
          {proof.ctaLabel}
        </span>
      </div>

      <article className='relative min-h-[13.25rem] overflow-hidden rounded-[1.08rem] border border-white/8 bg-[#0d1015] shadow-[0_14px_32px_rgba(0,0,0,0.22)] sm:-translate-y-2'>
        <Image
          alt={proof.screenshotAlt}
          fill
          sizes='(max-width: 768px) 100vw, 320px'
          src={proof.screenshotSrc}
          className='object-cover object-bottom'
        />
      </article>
    </div>
  );
}

function ShareProof({
  proof,
}: Readonly<{
  proof: ArtistProfileLandingCopy['outcomes']['syntheticProofs']['shareAnywhere'];
}>) {
  return (
    <div className='flex justify-center sm:pt-2'>
      <div className='relative ml-auto flex w-full max-w-[15.5rem] flex-col items-center rounded-[1.2rem] bg-[#fbfaf6] px-4 py-4.5 text-center text-black shadow-[0_16px_32px_rgba(0,0,0,0.14)]'>
        <p className='text-[11px] font-semibold tracking-[0.02em] text-black/72'>
          {proof.title}
        </p>

        <div className='mt-3.5 flex h-[9.75rem] w-[9.75rem] items-center justify-center rounded-[1rem] bg-white shadow-[inset_0_0_0_1px_rgba(17,17,17,0.06)]'>
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

        <p className='mt-3.5 font-mono text-[11.5px] font-semibold tracking-[-0.02em] text-black'>
          {proof.url}
        </p>
        <p className='mt-2 text-[11px] font-medium text-black/56'>
          {proof.subtitle}
        </p>
      </div>
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
