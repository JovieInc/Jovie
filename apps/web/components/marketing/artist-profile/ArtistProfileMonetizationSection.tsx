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
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { cn } from '@/lib/utils';
import {
 clampOutcomeIndex,
 getNearestOutcomeIndex,
} from './ArtistProfileOutcomesCarousel.utils';
import { SHELL_H2_CLASS, SHELL_LEAD_CLASS } from './ArtistProfileSectionHeader';
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
 className='bg-(--color-bg-base)'
 containerClassName='!max-w-none !px-0'
 width='page'
 >
 <div>
 <div className='mx-auto max-w-(--public-content-max-page) px-5 sm:px-6 lg:px-0'>
 <div className='max-w-xl'>
 <h2 className={SHELL_H2_CLASS}>
 <span className='block'>Get paid.</span>
 <span className='block'>Again and again.</span>
 </h2>
 <p className={`${SHELL_LEAD_CLASS} mt-5 max-w-xl sm:mt-6`}>
 {monetization.subhead}
 </p>
 </div>
 </div>

 <div className='relative mt-10 w-full overflow-x-hidden'>
 <section
 ref={scrollerRef}
 data-testid='artist-profile-monetization-scroller'
 aria-label='Monetization Card Carousel'
 className='relative grid grid-cols-1 gap-3 overflow-visible px-5 pb-2 sm:flex sm:gap-4 sm:overflow-x-auto sm:overflow-y-hidden sm:overscroll-contain sm:scroll-smooth sm:snap-x sm:snap-mandatory sm:pl-6 sm:pr-12 sm:scroll-pl-6 lg:pl-6 lg:pr-12 lg:scroll-pl-6 [-ms-overflow-style:none] [scrollbar-width:none] scrollbar-hide [&::-webkit-scrollbar]:hidden'
 >
 <button
 type='button'
 onClick={() => {
 scrollByDirection('next');
 }}
 className='sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-4 focus:z-30 focus:rounded-full focus:border focus:border-subtle focus:bg-(--color-cell-hover) focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
 >
 Browse monetization cards
 </button>
 <div className='pointer-events-none absolute right-6 top-5 z-20 hidden items-center gap-2 lg:flex'>
 <button
 type='button'
 onClick={() => {
 scrollByDirection('prev');
 }}
 disabled={activeCardIndex === 0}
 className={cn(
 'pointer-events-auto rounded-full border border-subtle bg-surface-0 p-2.5 text-primary-token backdrop-blur-xl transition-colors',
 activeCardIndex === 0
 ? 'cursor-not-allowed opacity-35'
 : 'hover:bg-surface-1 hover:text-primary-token'
 )}
 aria-label='Scroll Monetization Left'
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
 'pointer-events-auto rounded-full border border-subtle bg-surface-0 p-2.5 text-primary-token backdrop-blur-xl transition-colors',
 activeCardIndex === cards.length - 1
 ? 'cursor-not-allowed opacity-35'
 : 'hover:bg-surface-1 hover:text-primary-token'
 )}
 aria-label='Scroll Monetization Right'
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
 'relative z-10 max-w-xl',
 textAnchor === 'top'
 ? 'self-start text-left'
 : 'self-end text-right sm:max-w-xl'
 )}
 >
 <h3 className='text-lg font-semibold leading-relaxed tracking-tight text-primary-token'>
 {title}
 </h3>
 <p className='mt-3 text-app leading-relaxed tracking-tight text-secondary-token'>
 {body}
 </p>
 </div>
 );

 const visualBlock = (
 <div
 className={cn(
 'relative z-10',
 visualSide === 'right' ? 'self-end' : 'self-start',
 isIrlPaymentsCard && 'sm:-mb-6 sm:-mr-6 lg:-mb-6.5 lg:-mr-6.5'
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
 'relative flex w-full shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-base p-5 text-primary-token bg-base text-primary-token sm:w-60 sm:p-6 lg:w-60 lg:p-6.5',
 isCaptureCard
 ? 'min-h-52 sm:min-h-52 lg:min-h-52'
 : 'min-h-52 sm:min-h-52 lg:min-h-52'
 )}
 >
 <div
 aria-hidden='true'
 className='pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-2xl bg-surface-0'
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
 <div className='relative h-52 w-full max-w-xl overflow-hidden rounded-t-2xl rounded-b-none bg-(--color-bg-input) sm:h-52 sm:w-60 sm:max-w-none'>
 <Image
 alt='Pay drawer open inside an artist profile payment flow'
 className='object-cover object-bottom'
 fill
 sizes='(max-width: 640px) 18rem, 19rem'
 src={getMarketingExportImage('tim-white-profile-pay-mobile').publicUrl}
 />
 <div
 aria-hidden='true'
 className='pointer-events-none absolute inset-x-0 top-0 h-12 bg-surface-0'
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
 <div className='w-60 rounded-2xl bg-(--color-bg-input) px-4 py-3.5 text-primary-token '>
 <div className='flex items-start justify-between gap-3'>
 <div>
 <p className='text-sm font-semibold tracking-tight text-primary-token'>
 {card.fanName}
 </p>
 <div className='mt-1 inline-flex items-center gap-1.5 text-2xs font-medium text-secondary-token'>
 <MapPin className='h-3.5 w-3.5' strokeWidth={1.9} />
 {card.fanLocation}
 </div>
 </div>
 <div className='rounded-full bg-surface-1 px-2.5 py-1 text-2xs font-semibold text-primary-token text-primary-token'>
 {card.fanAmount}
 </div>
 </div>
 <div className='mt-3 rounded-2xl bg-surface-1 px-3 py-2.5'>
 <p className='text-xs font-medium tracking-tight text-secondary-token'>
 {card.fanIntent}
 </p>
 </div>
 <div className='mt-2.5 inline-flex rounded-full border border-subtle bg-surface-1 px-3 py-1.25 text-3xs font-semibold text-secondary-token'>
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
 <div className='w-60 rounded-2xl bg-(--color-bg-input) p-3.5 text-primary-token '>
 <div className='flex items-start gap-3'>
 <span className='mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-1 text-primary-token'>
 <Mail className='h-4 w-4' strokeWidth={1.9} />
 </span>
 <div className='min-w-0 flex-1'>
 <div className='flex items-center justify-between gap-3'>
 <p className='text-xs font-semibold tracking-tight text-primary-token'>
 {card.appName}
 </p>
 <p className='text-2xs font-medium text-secondary-token'>now</p>
 </div>
 <p className='mt-0.5 text-2xs font-medium text-secondary-token'>
 {card.sender}
 </p>
 <p className='mt-3 text-app font-semibold leading-relaxed tracking-tight text-primary-token'>
 {card.notificationTitle}
 </p>
 <p className='mt-1.5 text-xs leading-relaxed text-secondary-token'>
 {card.notificationPreview}
 </p>
 </div>
 </div>
 </div>
 );
}

function getOutputTransformClass(index: number): string {
 if (index === 1) return 'sm:translate-x-2.5';
 if (index >= 2) return 'sm:translate-x-5';
 return '';
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
 <div className='relative w-full max-w-xl sm:w-60 sm:max-w-none'>
 {card.outputs.map((output, index) => {
 const Icon = iconMap[output.id];
 return (
 <div
 key={output.id}
 className={cn(
 'relative rounded-xl bg-(--color-bg-input) px-3.5 py-3.5 text-primary-token ',
 getOutputTransformClass(index),
 index > 0 && 'mt-2.5'
 )}
 >
 <div className='flex items-start gap-3'>
 <span className='mt-0.5 inline-flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full bg-surface-1 text-primary-token'>
 <Icon className='h-4 w-4' strokeWidth={1.9} />
 </span>
 <div className='min-w-0'>
 <p className='text-xs font-semibold leading-relaxed tracking-tight text-primary-token'>
 {output.title}
 </p>
 <p className='mt-1.5 text-2xs leading-relaxed text-secondary-token'>
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
