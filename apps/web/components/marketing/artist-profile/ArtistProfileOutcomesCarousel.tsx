'use client';

import { Check, ChevronLeft, ChevronRight, Mail } from 'lucide-react';
import Image from 'next/image';
import { useId, useRef } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import {
 HOMEPAGE_PROFILE_PREVIEW_ARTIST,
 HOMEPAGE_PROFILE_PREVIEW_RELEASES,
 HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES,
} from '@/features/home/homepage-profile-preview-fixture';
import { ProfilePrimaryActionCard } from '@/features/profile/ProfilePrimaryActionCard';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
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
 'straight-to-listen': 'w-full sm:w-60 lg:w-60',
 'local-dates-first': 'w-full sm:w-60 lg:w-60',
 'support-without-friction': 'w-full sm:w-60 lg:w-60',
 'capture-the-fan': 'w-full sm:w-60 lg:w-60',
 'one-link-everywhere': 'w-full sm:w-60 lg:w-60',
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
 const reducedMotion = useReducedMotion();

 const scrollByDirection = (direction: 'prev' | 'next') => {
 const rail = scrollerRef.current;
 if (!rail) {
 return;
 }

 const scrollStep = Math.max(rail.clientWidth * 0.8, 240);
 const nextLeft = direction === 'next' ? scrollStep : -scrollStep;

 rail.scrollBy({
 left: nextLeft,
 behavior: reducedMotion ? 'auto' : 'smooth',
 });
 };

 return (
 <ArtistProfileSectionShell
 className='bg-surface-0'
 containerClassName='!max-w-none !px-0'
 width='page'
 >
 <div>
 <div className='mx-auto max-w-public-content px-5 sm:px-6 lg:px-0'>
 <ArtistProfileSectionHeader
 align='left'
 headline={outcomes.headline}
 body={outcomes.body}
 className='max-w-xl'
 bodyClassName='max-w-xl'
 />
 </div>

 <div
 data-testid='artist-profile-outcomes-scroller'
 className='hidden'
 aria-hidden='true'
 />

 <p id='artist-profile-outcomes-instructions' className='sr-only'>
 Browse the five outcome cards. Previous and next controls are
 available when the cards form a horizontal rail.
 </p>

 <div className='relative mt-10 w-full overflow-x-hidden'>
 <div className='pointer-events-none absolute right-6 top-4 z-20 hidden items-center gap-2 lg:flex'>
 <button
 type='button'
 aria-controls={railId}
 aria-label='Scroll Outcomes Left'
 onClick={() => {
 scrollByDirection('prev');
 }}
 className='pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-subtle bg-surface-0 text-primary-token backdrop-blur-xl transition-colors hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base'
 >
 <ChevronLeft className='h-4 w-4' aria-hidden='true' />
 </button>
 <button
 type='button'
 aria-controls={railId}
 aria-label='Scroll Outcomes Right'
 onClick={() => {
 scrollByDirection('next');
 }}
 className='pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-subtle bg-surface-0 text-primary-token backdrop-blur-xl transition-colors hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base'
 >
 <ChevronRight className='h-4 w-4' aria-hidden='true' />
 </button>
 </div>

 <div className='hidden sm:block lg:hidden'>
 <div className='sr-only focus-within:not-sr-only focus-within:absolute focus-within:left-6 focus-within:top-4 focus-within:z-20 focus-within:flex focus-within:gap-2'>
 <button
 type='button'
 aria-controls={railId}
 aria-label='Scroll Outcomes Left'
 onClick={() => {
 scrollByDirection('prev');
 }}
 className='min-h-11 min-w-11 rounded-full border border-subtle bg-(--color-cell-hover) px-3 py-2 text-xs font-semibold text-primary-token text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
 >
 Prev
 </button>
 <button
 type='button'
 aria-controls={railId}
 aria-label='Scroll Outcomes Right'
 onClick={() => {
 scrollByDirection('next');
 }}
 className='min-h-11 min-w-11 rounded-full border border-subtle bg-(--color-cell-hover) px-3 py-2 text-xs font-semibold text-primary-token text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
 >
 Next
 </button>
 </div>
 </div>

 <section
 ref={scrollerRef}
 id={railId}
 data-testid='artist-profile-outcomes-grid'
 aria-label='Outcome Showcase'
 aria-describedby='artist-profile-outcomes-instructions'
 className={cn(
 'relative grid grid-cols-1 gap-3 overflow-visible pb-3 pl-5 pr-5 sm:flex sm:gap-3.5 sm:overflow-x-auto sm:overflow-y-hidden sm:overscroll-x-contain sm:snap-x sm:snap-mandatory sm:pl-6 sm:pr-[12vw] sm:scroll-pl-6 lg:pl-8 lg:pr-[14vw] lg:scroll-pl-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
 !reducedMotion && 'sm:scroll-smooth'
 )}
 >
 {outcomes.landingCards.map(card => (
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
 card: ArtistProfileLandingCopy['outcomes']['landingCards'][number];
 outcomes: ArtistProfileLandingCopy['outcomes'];
}>) {
 const proof = outcomes.syntheticProofs;

 return (
 <article
 data-testid='artist-profile-outcome-card'
 className={cn(
 'group relative flex shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-subtle bg-surface-0 ',
 OUTCOME_CARD_WIDTHS[card.id]
 )}
 >
 <div className='relative flex h-full flex-col p-4 sm:p-5'>
 <div className='max-w-xl'>
 <h3 className='max-w-xl text-2xl font-semibold leading-tight tracking-tight text-primary-token sm:text-3xl'>
 {card.title}
 </h3>
 <p className='mt-3 max-w-xl text-app leading-relaxed text-secondary-token'>
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

 <div className='flex h-full flex-col rounded-2xl border border-subtle bg-surface-1 px-3.5 py-3 '>
 <p className='text-xs font-semibold tracking-tight text-primary-token'>
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
 <span className='text-2xs font-medium leading-relaxed tracking-tight text-secondary-token'>
 {row.month}
 <span className='block text-sm font-semibold tracking-tight text-primary-token'>
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
 <div className='flex flex-col justify-between rounded-2xl border border-subtle bg-surface-1 px-3 py-3 sm:pt-3.5'>
 <div>
 <p className='text-2xs font-medium tracking-tight text-tertiary-token'>
 {proof.drawerTitle}
 </p>
 <p className='mt-1 text-app font-semibold tracking-tight text-primary-token'>
 {proof.drawerSubtitle}
 </p>
 </div>

 <div className='mt-3 space-y-1.5'>
 <p className='text-2xs font-medium tracking-tight text-tertiary-token'>
 {proof.chooseAmountLabel}
 </p>
 <div className='grid gap-1.5'>
 {proof.amountRows.map(row => (
 <div
 key={row.id}
 className={cn(
 'flex items-center justify-between rounded-2xl border px-3 py-1.75 text-xs',
 row.featured
 ? 'border-default bg-surface-1 text-primary-token text-primary-token'
 : 'border-subtle bg-surface-1 text-primary-token'
 )}
 >
 <span className='font-semibold tracking-tight'>
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

 <span className='mt-3 inline-flex w-fit rounded-full bg-surface-1 px-3.5 py-2 text-2xs font-semibold text-primary-token text-primary-token'>
 {proof.ctaLabel}
 </span>
 </div>

 <article className='relative min-h-52 overflow-hidden rounded-2xl border border-subtle bg-(--color-bg-input) sm:-translate-y-2'>
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
 <div className='relative ml-auto flex w-full max-w-xl flex-col items-center rounded-2xl bg-(--color-badge-text) px-4 py-4.5 text-center text-primary-token text-primary-token '>
 <p className='text-2xs font-semibold tracking-tight text-secondary-token'>
 {proof.title}
 </p>

 <div
 className='system-b-qr-preview mt-3.5 flex h-39 w-39 items-center justify-center rounded-xl bg-(--qr-preview-paper) '

 >
 <div className='grid grid-cols-7 gap-2'>
 {QR_CELLS.map(cell => (
 <span
 key={cell.id}
 className={cn(
 'h-2.5 w-2.5 rounded-xs',
 cell.filled
 ? 'bg-(--qr-preview-ink)'
 : 'bg-(--qr-preview-paper)'
 )}
 />
 ))}
 </div>
 </div>

 <p className='mt-3.5 font-mono text-2xs font-semibold tracking-tight text-primary-token text-primary-token'>
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
