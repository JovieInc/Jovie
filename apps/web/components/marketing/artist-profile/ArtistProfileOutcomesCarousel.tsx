'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Heart,
  Mail,
  Music2,
  QrCode,
  Ticket,
  WalletCards,
} from 'lucide-react';
import Image from 'next/image';
import type { CSSProperties } from 'react';
import { useRef } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileOutcomesCarouselProps {
  readonly outcomes: ArtistProfileLandingCopy['outcomes'];
}

type OutcomeId = ArtistProfileLandingCopy['outcomes']['cards'][number]['id'];

const OUTCOME_CARD_ICONS: Record<OutcomeId, LucideIcon> = {
  'drive-streams': Music2,
  'sell-out': Ticket,
  'get-paid': WalletCards,
  'say-thanks': Heart,
  'share-anywhere': QrCode,
};

const OUTCOME_CARD_ACCENTS: Record<OutcomeId, string> = {
  'drive-streams': 'var(--color-accent-teal)',
  'sell-out': 'var(--color-accent-blue)',
  'get-paid': 'var(--color-accent-green)',
  'say-thanks': 'var(--color-accent-purple)',
  'share-anywhere': 'var(--color-accent-orange)',
};

const PRODUCT_CROPS: Partial<
  Record<
    OutcomeId,
    {
      readonly src: string;
      readonly alt: string;
      readonly label: string;
      readonly meta: string;
      readonly imageClassName: string;
    }
  >
> = {
  'drive-streams': {
    src: '/product-screenshots/tim-white-profile-presave-phone.png',
    alt: 'Jovie profile release countdown crop.',
    label: 'Latest release',
    meta: 'Pre-save live',
    imageClassName: 'top-[-5.75rem] w-[13.5rem] sm:w-[15rem]',
  },
  'sell-out': {
    src: '/product-screenshots/tim-white-profile-tour-phone.png',
    alt: 'Jovie profile shows drawer crop.',
    label: 'Shows',
    meta: 'O2 Arena saved',
    imageClassName: 'top-[-6.5rem] w-[13.5rem] sm:w-[15rem]',
  },
  'get-paid': {
    src: '/product-screenshots/tim-white-profile-pay-phone.png',
    alt: 'Jovie profile support drawer crop.',
    label: 'Support',
    meta: 'Tip drawer ready',
    imageClassName: 'top-[-7.25rem] w-[13.5rem] sm:w-[15rem]',
  },
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
    <ArtistProfileSectionShell className='bg-white/[0.01]' width='landing'>
      <div className='flex items-end justify-between gap-6'>
        <div>
          <h2 className='marketing-h2-linear max-w-[13ch] text-primary-token'>
            {outcomes.headline}
          </h2>
          {outcomes.body ? (
            <p className='mt-5 max-w-[32rem] text-[15px] leading-[1.7] text-secondary-token'>
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
        className='mt-10 flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2 pr-[12vw] [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-5 sm:pr-[18vw] lg:pr-[22vw] [&::-webkit-scrollbar]:hidden'
      >
        {outcomes.cards.map((card, index) => (
          <OutcomeCard key={card.id} card={card} index={index} />
        ))}
      </div>
    </ArtistProfileSectionShell>
  );
}

function OutcomeCard({
  card,
  index,
}: {
  readonly card: ArtistProfileLandingCopy['outcomes']['cards'][number];
  readonly index: number;
}) {
  const Icon = OUTCOME_CARD_ICONS[card.id];
  const style: OutcomeAccentStyle = {
    '--outcome-accent': OUTCOME_CARD_ACCENTS[card.id],
    flex: '0 0 min(84vw, 62rem)',
  };
  const productCrop = PRODUCT_CROPS[card.id];

  return (
    <article
      className='group relative flex min-h-[30rem] snap-start flex-col overflow-hidden rounded-[1.7rem] bg-[#050505]'
      style={style}
    >
      <div
        className='absolute inset-0 opacity-80'
        style={{
          background:
            'radial-gradient(circle at 72% 82%, color-mix(in srgb, var(--outcome-accent) 14%, transparent), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.014) 44%, rgba(0,0,0,0.42))',
        }}
        aria-hidden='true'
      />
      <div className='relative flex h-full flex-col p-5 sm:p-6'>
        <div className='min-w-0'>
          <p className='font-mono text-[12px] tracking-[-0.02em] text-tertiary-token'>
            0{index + 1}
          </p>
          <div className='mt-4 flex items-start justify-between gap-4'>
            <h3 className='max-w-[11ch] text-[32px] font-semibold leading-[0.98] tracking-[-0.055em] text-primary-token sm:text-[40px]'>
              {card.title}
            </h3>
            <span
              className='mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.045] text-[color:var(--outcome-accent)]'
              aria-hidden='true'
            >
              <Icon className='h-[18px] w-[18px]' strokeWidth={1.8} />
            </span>
          </div>
          <p className='mt-4 max-w-[24rem] text-[14px] leading-[1.55] text-secondary-token'>
            {card.description}
          </p>
        </div>

        <div className='mt-auto pt-7'>
          {productCrop ? (
            <ProductCrop crop={productCrop} />
          ) : card.id === 'say-thanks' ? (
            <ThanksProof />
          ) : (
            <ShareProof />
          )}
        </div>
      </div>
    </article>
  );
}

function ProductCrop({
  crop,
}: Readonly<{
  crop: NonNullable<(typeof PRODUCT_CROPS)[keyof typeof PRODUCT_CROPS]>;
}>) {
  return (
    <div className='relative h-[16rem] overflow-hidden rounded-[1.35rem] bg-black/38 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]'>
      <div
        className='absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 bg-black/42 px-3 py-2.5 backdrop-blur-md'
        aria-hidden='true'
      >
        <span className='text-[11px] font-semibold tracking-[-0.01em] text-primary-token'>
          {crop.label}
        </span>
        <span className='rounded-full bg-white/[0.065] px-2 py-1 text-[10px] font-semibold text-secondary-token'>
          {crop.meta}
        </span>
      </div>
      <Image
        src={crop.src}
        alt={crop.alt}
        width={660}
        height={1368}
        loading='eager'
        sizes='240px'
        className={`absolute left-1/2 max-w-none -translate-x-1/2 rounded-[2rem] shadow-[0_24px_60px_rgba(0,0,0,0.4)] ${crop.imageClassName}`}
      />
    </div>
  );
}

function ThanksProof() {
  return (
    <div className='rounded-[1.35rem] bg-black/38 p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]'>
      <div className='flex items-center justify-between gap-3'>
        <span className='text-[11px] font-semibold text-primary-token'>
          Follow-up
        </span>
        <span className='flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2 py-1 text-[10px] font-semibold text-secondary-token'>
          <Check className='h-3 w-3 text-[color:var(--outcome-accent)]' />
          Sent
        </span>
      </div>
      <div className='mt-3 rounded-[1.1rem] bg-white/[0.035] p-3'>
        <p className='text-[12px] font-semibold text-primary-token'>
          Tim White
        </p>
        <p className='mt-2 text-[13px] leading-[1.45] text-secondary-token'>
          Thanks for the support. New song inside.
        </p>
      </div>
      <div className='mt-3 flex items-center gap-2 text-[11px] text-tertiary-token'>
        <Mail className='h-3.5 w-3.5 text-[color:var(--outcome-accent)]' />
        Email captured after $10 support
      </div>
    </div>
  );
}

function ShareProof() {
  return (
    <div className='rounded-[1.35rem] bg-black/38 p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]'>
      <div className='flex items-center justify-between gap-3 rounded-full bg-white/[0.045] px-3 py-2.5'>
        <span className='font-mono text-[11px] text-secondary-token'>
          jov.ie/timwhite
        </span>
        <span className='flex items-center gap-1.5 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-black'>
          <Copy className='h-3 w-3' strokeWidth={2} />
          Copied
        </span>
      </div>
      <div className='mt-3 grid grid-cols-[auto_1fr] gap-3 rounded-[1.1rem] bg-white/[0.035] p-3'>
        <span className='flex h-12 w-12 items-center justify-center rounded-[0.9rem] bg-white text-black'>
          <QrCode className='h-6 w-6' strokeWidth={1.8} />
        </span>
        <div className='min-w-0'>
          <p className='text-[12px] font-semibold text-primary-token'>
            Share-ready
          </p>
          <div className='mt-2 flex flex-wrap gap-1.5'>
            {['Bio', 'QR', 'Stories'].map(channel => (
              <span
                key={channel}
                className='rounded-full bg-white/[0.055] px-2 py-1 text-[10px] font-semibold text-tertiary-token'
              >
                {channel}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
