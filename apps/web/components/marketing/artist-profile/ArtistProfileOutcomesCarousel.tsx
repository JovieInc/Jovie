'use client';

import Image from 'next/image';
import type { CSSProperties } from 'react';
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
            headlineClassName='max-w-none'
            bodyClassName='max-w-[28rem]'
          />
        </div>

        <div
          data-testid='artist-profile-outcomes-scroller'
          className='hidden'
          aria-hidden='true'
        />

        <div
          data-testid='artist-profile-outcomes-grid'
          className='mx-auto mt-10 grid max-w-[var(--linear-content-max)] gap-4 px-5 sm:px-6 md:grid-cols-2 lg:px-0'
        >
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
  };

  const proof = outcomes.syntheticProofs;

  return (
    <article
      data-testid='artist-profile-outcome-card'
      className='group relative flex min-h-[29rem] flex-col overflow-hidden rounded-[1.6rem] border border-white/8 bg-[#050505] shadow-[0_28px_68px_rgba(0,0,0,0.3)]'
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
      <div className='relative flex h-full flex-col p-5 sm:p-6'>
        <div className='max-w-[21rem]'>
          <h3 className='max-w-[14ch] text-[clamp(1.4rem,2vw,1.7rem)] font-[620] leading-[1.18] tracking-[-0.035em] text-primary-token'>
            {card.title}
          </h3>
          <p className='mt-3 max-w-[19rem] text-[13px] leading-[1.58] text-secondary-token'>
            {card.description}
          </p>
        </div>

        <div className='mt-6 flex-1'>
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

function ProofTag({
  className,
  label,
}: Readonly<{
  className?: string;
  label: string;
}>) {
  return (
    <span
      className={cn(
        'inline-flex w-fit rounded-full border border-white/10 bg-black/46 px-2.5 py-1 text-[10.5px] font-medium text-white/72 backdrop-blur-xl',
        className
      )}
    >
      {label}
    </span>
  );
}

function ProofActionCardFrame({
  label,
  children,
  className,
}: Readonly<{
  label: string;
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <article
      className={cn(
        'relative flex min-h-[12.5rem] overflow-hidden rounded-[1.28rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-4 shadow-[0_22px_54px_rgba(0,0,0,0.28)]',
        className
      )}
    >
      <div className='absolute inset-x-6 top-0 h-16 rounded-full bg-white/8 blur-3xl' />
      <ProofTag className='absolute left-3 top-3 z-10' label={label} />
      <div className='relative z-10 mt-7 flex w-full items-center'>
        {children}
      </div>
    </article>
  );
}

const SHOWCASE_NOW = new Date('2026-04-20T12:00:00.000Z');

function DriveStreamsProof() {
  return (
    <div className='grid h-full min-h-[18.75rem] gap-3 sm:grid-cols-2'>
      <ProofActionCardFrame label='Latest release'>
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
      </ProofActionCardFrame>

      <ProofActionCardFrame label='Countdown'>
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
      </ProofActionCardFrame>
    </div>
  );
}

function SellOutProof({
  proof,
}: Readonly<{
  proof: ArtistProfileLandingCopy['outcomes']['syntheticProofs']['visualProofs']['sellOut'];
}>) {
  return (
    <div className='grid h-full min-h-[18.75rem] gap-3 sm:grid-cols-[0.94fr_1.06fr]'>
      <ProofActionCardFrame
        label={proof.nearbyCardLabel}
        className='bg-[linear-gradient(180deg,rgba(244,241,232,0.12),rgba(255,255,255,0.02))]'
      >
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
      </ProofActionCardFrame>

      <div className='flex-1 rounded-[1.25rem] border border-white/10 bg-black/34 px-4 pb-4 pt-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl'>
        <div className='rounded-[1.05rem] border border-white/6 bg-white/[0.02] px-4 pb-2 pt-4 shadow-[0_18px_44px_rgba(0,0,0,0.2)]'>
          <p className='text-[12px] font-semibold tracking-[-0.02em] text-white'>
            {proof.drawerTitle}
          </p>
          <p className='mt-1 text-[11px] text-white/44'>
            {proof.drawerSubtitle}
          </p>
          <div className='mt-3 divide-y divide-white/6'>
            {proof.drawerRows.map(row => (
              <div
                key={row.id}
                className='grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2.5 py-3'
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
    <div className='grid h-full min-h-[18.75rem] gap-3 sm:grid-cols-[0.92fr_1.08fr]'>
      <div className='flex flex-col justify-between rounded-[1.25rem] border border-white/10 bg-black/34 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl'>
        <div>
          <p className='text-[11px] font-medium tracking-[-0.01em] text-white/48'>
            {proof.drawerTitle}
          </p>
          <p className='mt-1 text-[13px] font-semibold tracking-[-0.03em] text-white'>
            {proof.drawerSubtitle}
          </p>
        </div>

        <div className='mt-4 space-y-2'>
          <p className='text-[11px] font-medium tracking-[-0.01em] text-white/48'>
            {proof.chooseAmountLabel}
          </p>
          <div className='grid gap-2'>
            {proof.amountRows.map(row => (
              <div
                key={row.id}
                className={cn(
                  'flex items-center justify-between rounded-[0.9rem] border px-3 py-2.5 text-[12px]',
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

        <span className='mt-4 inline-flex w-fit rounded-full bg-white px-3.5 py-2 text-[11px] font-semibold text-black'>
          {proof.ctaLabel}
        </span>
      </div>

      <article className='relative min-h-[15.5rem] overflow-hidden rounded-[1.3rem] border border-white/10 bg-[#0d1015] shadow-[0_22px_54px_rgba(0,0,0,0.32)]'>
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
    <div className='flex h-full min-h-[18.5rem] items-center justify-center'>
      <div className='relative ml-auto flex w-full max-w-[18rem] flex-col items-center justify-center rounded-[1.5rem] bg-[#fbfaf6] px-5 py-6 text-center text-black shadow-[0_24px_48px_rgba(0,0,0,0.22)]'>
        <p className='text-[11px] font-semibold tracking-[0.02em] text-black/72'>
          {proof.title}
        </p>

        <div className='relative mt-5 translate-x-2 sm:translate-x-4'>
          <div className='absolute -left-9 top-4 rounded-full bg-black/6 px-2.5 py-1 text-[10px] font-medium text-black/54'>
            Bio
          </div>
          <div className='absolute -right-8 top-10 rounded-full bg-black/6 px-2.5 py-1 text-[10px] font-medium text-black/54'>
            Stories
          </div>
          <div className='absolute -right-4 -top-4 rounded-full bg-black/6 px-2.5 py-1 text-[10px] font-medium text-black/54'>
            QR
          </div>
          <div className='absolute inset-x-6 -top-4 h-8 rounded-full bg-black/10 blur-2xl' />
          <div className='relative rounded-[1.35rem] bg-white p-3 shadow-[0_16px_30px_rgba(0,0,0,0.12)]'>
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

        <p className='mt-4 font-mono text-[11.5px] font-semibold tracking-[-0.02em] text-black'>
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
