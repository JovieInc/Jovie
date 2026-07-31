'use client';

import { Check, Mail } from 'lucide-react';
import Image from 'next/image';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import {
  HOMEPAGE_PROFILE_PREVIEW_ARTIST,
  HOMEPAGE_PROFILE_PREVIEW_RELEASES,
  HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES,
} from '@/features/home/homepage-profile-preview-fixture';
import { ProfilePrimaryActionCard } from '@/features/profile/ProfilePrimaryActionCard';
import { cn } from '@/lib/utils';
import { MarketingSnapRail } from '../MarketingSnapRail';
import './ArtistProfileOutcomesCarousel.css';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileOutcomesCarouselProps {
  readonly outcomes: ArtistProfileLandingCopy['outcomes'];
}

type OutcomeId =
  ArtistProfileLandingCopy['outcomes']['landingCards'][number]['id'];

// Per-card widths. Horizontal rail lets each outcome take the room its
// mockup actually needs. Drive streams and Sell out need side-by-side
// proofs, so they get wider slots; Share anywhere is a single QR card
// and can stay narrow.
const OUTCOME_CARD_WIDTHS: Record<OutcomeId, string> = {
  'straight-to-listen': 'w-full sm:w-136 lg:w-152',
  'local-dates-first': 'w-full sm:w-144 lg:w-160',
  'support-without-friction': 'w-full sm:w-120 lg:w-128',
  'capture-the-fan': 'w-full sm:w-108 lg:w-116',
  'one-link-everywhere': 'w-full sm:w-96 lg:w-104',
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
      className='ap-outcomes'
      containerClassName='!max-w-none !px-0'
      width='page'
    >
      <div>
        <div className='mx-auto max-w-public-content px-5 sm:px-6 lg:px-0'>
          <ArtistProfileSectionHeader
            align='left'
            headline={outcomes.headline}
            body={outcomes.body}
            className='max-w-152'
            bodyClassName='max-w-120'
          />
        </div>

        {/* Compatibility stub: historical e2e asserts the legacy scroller node stays hidden. */}
        <div
          data-testid='artist-profile-outcomes-scroller'
          className='hidden'
          aria-hidden='true'
        />

        <div className='mt-10'>
          <MarketingSnapRail
            ariaLabel='Outcome Showcase'
            instructionsId='artist-profile-outcomes-instructions'
            instructions='Browse the five outcome cards. Previous and next controls are available when the cards form a horizontal rail.'
            scrollerTestId='artist-profile-outcomes-grid'
            previousLabel='Scroll Outcomes Left'
            nextLabel='Scroll Outcomes Right'
            testId='artist-profile-outcomes-rail'
          >
            {outcomes.landingCards.map(card => (
              <OutcomeCard key={card.id} card={card} outcomes={outcomes} />
            ))}
          </MarketingSnapRail>
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}

function OutcomeCard({
  card,
  outcomes,
}: Readonly<{
  card: ArtistProfileLandingCopy['outcomes']['landingCards'][number];
  outcomes: ArtistProfileLandingCopy['outcomes'];
}>) {
  const proof = outcomes.syntheticProofs;

  return (
    <article
      data-testid='artist-profile-outcome-card'
      className={cn(
        'ap-outcomes__card group relative flex shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-subtle bg-surface-0',
        OUTCOME_CARD_WIDTHS[card.id]
      )}
    >
      <div className='relative flex h-full flex-col p-4 sm:p-5'>
        <div className='max-w-72'>
          <h3 className='ap-outcomes__card-title text-2xl font-semibold leading-tight tracking-tight text-primary-token sm:text-3xl'>
            {card.title}
          </h3>
          <p className='ap-outcomes__card-body mt-3 text-app leading-relaxed text-secondary-token'>
            {card.description}
          </p>
        </div>

        <div className='mt-6'>
          {card.id === 'straight-to-listen' ? <DriveStreamsProof /> : null}
          {card.id === 'local-dates-first' ? (
            <SellOutProof proof={proof.visualProofs.sellOut} />
          ) : null}
          {card.id === 'support-without-friction' ? (
            <GetPaidProof proof={proof.visualProofs.getPaid} />
          ) : null}
          {card.id === 'capture-the-fan' ? (
            <CaptureFanProof proof={proof.captureFan} />
          ) : null}
          {card.id === 'one-link-everywhere' ? (
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

      <div className='ap-outcomes__drawer flex h-full flex-col border border-subtle px-3.5 py-3'>
        <p className='ap-outcomes__drawer-title text-xs font-semibold text-primary-token'>
          {proof.drawerTitle}
        </p>
        <p className='mt-1 text-2xs text-tertiary-token'>
          {proof.drawerSubtitle}
        </p>
        <div className='mt-2.5 divide-y divide-white/6'>
          {proof.drawerRows.map(row => (
            <div
              key={row.id}
              className='grid grid-cols-[2.45rem_minmax(0,1fr)_auto] items-center gap-2 py-2.25'
            >
              <span className='ap-outcomes__tour-month text-2xs font-medium text-secondary-token'>
                {row.month}
                <span className='ap-outcomes__tour-day block text-sm font-semibold text-primary-token'>
                  {row.day}
                </span>
              </span>
              <span className='min-w-0'>
                <span className='block truncate text-xs font-semibold text-primary-token'>
                  {row.venue}
                </span>
                <span className='block truncate text-2xs text-tertiary-token'>
                  {row.location}
                </span>
              </span>
              <span className='text-2xs font-medium text-secondary-token'>
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
      <div className='ap-outcomes__drawer flex flex-col justify-between border border-subtle px-3 py-3 sm:pt-3.5'>
        <div>
          <p className='ap-outcomes__drawer-label text-2xs font-medium text-tertiary-token'>
            {proof.drawerTitle}
          </p>
          <p className='ap-outcomes__drawer-subtitle mt-1 text-app font-semibold text-primary-token'>
            {proof.drawerSubtitle}
          </p>
        </div>

        <div className='mt-3 space-y-1.5'>
          <p className='ap-outcomes__drawer-label text-2xs font-medium text-tertiary-token'>
            {proof.chooseAmountLabel}
          </p>
          <div className='grid gap-1.5'>
            {proof.amountRows.map(row => (
              <div
                key={row.id}
                className={cn(
                  'ap-outcomes__amount flex items-center justify-between px-3 py-1.75 text-xs',
                  row.featured && 'ap-outcomes__amount--featured'
                )}
              >
                <span className='ap-outcomes__amount-value font-semibold'>
                  {row.amount}
                </span>
                <span
                  className={cn(
                    'text-3xs font-medium',
                    row.featured
                      ? 'text-secondary-token'
                      : 'text-tertiary-token'
                  )}
                >
                  {row.currency}
                </span>
              </div>
            ))}
          </div>
        </div>

        <span className='mt-3 inline-flex w-fit rounded-full bg-surface-1 px-3.5 py-2 text-2xs font-semibold text-primary-token'>
          {proof.ctaLabel}
        </span>
      </div>

      <article className='ap-outcomes__shot relative min-h-53 overflow-hidden border border-subtle bg-surface-input sm:-translate-y-2'>
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

function CaptureFanProof({
  proof,
}: Readonly<{
  proof: ArtistProfileLandingCopy['outcomes']['syntheticProofs']['captureFan'];
}>) {
  return (
    <div className='rounded-xl border border-subtle bg-surface-1 p-4 sm:p-5'>
      <div className='flex items-center gap-3'>
        <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-2 text-primary-token'>
          <Mail className='h-4 w-4' aria-hidden='true' />
        </span>
        <div>
          <p className='text-xs font-semibold text-primary-token'>
            {proof.inputLabel}
          </p>
          <p className='mt-1 font-mono text-xs text-tertiary-token'>
            {proof.inputValue}
          </p>
        </div>
      </div>

      <div className='mt-4 flex items-center justify-between gap-3 rounded-lg border border-subtle bg-surface-0 px-3 py-2.5'>
        <span className='text-xs font-medium text-secondary-token'>
          {proof.ctaLabel}
        </span>
        <span className='inline-flex items-center gap-1.5 rounded-full bg-primary-token px-3 py-1.5 text-3xs font-semibold text-surface-1'>
          <Check className='h-3 w-3' aria-hidden='true' />
          {proof.confirmedLabel}
        </span>
      </div>

      <p className='mt-4 flex items-center gap-2 text-xs font-medium text-secondary-token'>
        <span
          aria-hidden='true'
          className='h-1.5 w-1.5 rounded-full bg-success'
        />
        {proof.followUpLabel}
      </p>
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
      <div className='ap-outcomes__qr-card relative ml-auto flex w-full max-w-62 flex-col items-center bg-badge-text px-4 py-4.5 text-center text-primary-token'>
        <p className='ap-outcomes__qr-title text-2xs font-semibold text-secondary-token'>
          {proof.title}
        </p>

        <div className='ap-outcomes__qr-frame mt-3.5 flex h-39 w-39 items-center justify-center rounded-xl'>
          <div className='grid grid-cols-7 gap-2'>
            {QR_CELLS.map(cell => (
              <span
                key={cell.id}
                className={cn(
                  'h-2.5 w-2.5 rounded-xs',
                  cell.filled
                    ? 'ap-outcomes__qr-cell--filled'
                    : 'ap-outcomes__qr-cell--empty'
                )}
              />
            ))}
          </div>
        </div>

        <p className='ap-outcomes__qr-url mt-3.5 font-mono text-2xs font-semibold text-primary-token'>
          {proof.url}
        </p>
        <p className='mt-2 text-2xs font-medium text-tertiary-token'>
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
