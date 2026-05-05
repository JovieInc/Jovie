'use client';

import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { SHELL_H2_CLASS } from '@/components/marketing/artist-profile/ArtistProfileSectionHeader';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { cn } from '@/lib/utils';

interface AuthBrandPanelProps {
  readonly className?: string;
  /** Kept for back-compat with existing call sites; only 'page' is rendered. */
  readonly variant?: 'page' | 'image-only' | 'v1';
}

const SLIDE_MS = 5500;

const SLIDES = [
  {
    id: 'dashboard-releases-sidebar-desktop',
    image: getMarketingExportImage('dashboard-releases-sidebar-desktop'),
  },
  {
    id: 'dashboard-audience-desktop',
    image: getMarketingExportImage('dashboard-audience-desktop'),
  },
  {
    id: 'artist-spec-tracked-links-desktop',
    image: getMarketingExportImage('artist-spec-tracked-links-desktop'),
  },
] as const;

export function AuthBrandPanel({ className }: Readonly<AuthBrandPanelProps>) {
  return (
    <div
      data-testid='auth-brand-panel'
      className={cn(
        'auth-showcase-panel relative flex h-full min-h-[34rem] flex-col overflow-hidden rounded-[28px] bg-white text-black shadow-[0_24px_60px_rgba(0,0,0,0.35)]',
        'lg:min-h-[calc(100svh-7.5rem)]',
        className
      )}
    >
      <AuthBrandCarousel />
    </div>
  );
}

function AuthBrandCarousel() {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = globalThis.setInterval(() => {
      setIndex(prev => (prev + 1) % SLIDES.length);
    }, SLIDE_MS);
    return () => {
      globalThis.clearInterval(timer);
    };
  }, [reducedMotion]);

  const slide = SLIDES[index];

  return (
    <div className='absolute inset-0 flex flex-col'>
      {/* Spacer — pushes the floating screenshot down toward visual center. */}
      <div className='min-h-0 flex-1' />

      {/* Image area — fixed aspect ratio so the screenshot doesn't get
          dwarfed. Browser-chrome top bar + a light gray surround give
          structural separation from the white card behind. */}
      <div className='relative mx-8 sm:mx-10'>
        <div className='overflow-hidden rounded-[14px] bg-[#f4f4f6] shadow-[0_24px_60px_rgba(0,0,0,0.14)] ring-1 ring-black/[0.08]'>
          {/* Browser chrome */}
          <div className='flex h-7 items-center gap-1.5 border-b border-black/[0.06] bg-[#ebecee] px-3'>
            <span className='size-2 rounded-full bg-black/15' />
            <span className='size-2 rounded-full bg-black/15' />
            <span className='size-2 rounded-full bg-black/15' />
          </div>
          {/* Screenshot stage */}
          <div className='relative aspect-[16/10]'>
            <AnimatePresence mode='sync'>
              <motion.div
                key={slide.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: reducedMotion ? 0 : 0.32,
                  ease: 'easeOut',
                }}
                className='absolute inset-0'
              >
                <Image
                  src={slide.image.publicUrl}
                  alt={slide.image.alt}
                  width={slide.image.width}
                  height={slide.image.height}
                  priority
                  unoptimized
                  className='absolute inset-0 h-full w-full object-cover object-top'
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Spacer — keeps the headline anchored at the bottom while the
          screenshot floats toward the center. */}
      <div className='min-h-0 flex-1' />

      {/* Headline — bottom-left of the card, sits above the bars. */}
      <div className='relative z-10 px-8 pb-5 sm:px-10 sm:pb-6'>
        <h2 className={cn(SHELL_H2_CLASS, 'text-balance text-black')}>
          Built for Artists.
        </h2>
      </div>

      {/* Segmented progress bars — one per slide, side-by-side at the bottom. */}
      <div
        aria-hidden='true'
        className='relative z-10 flex gap-1.5 px-8 pb-7 sm:px-10 sm:pb-8'
      >
        {SLIDES.map((s, i) => (
          <ProgressSegment
            key={s.id}
            state={i < index ? 'past' : i === index ? 'active' : 'future'}
            reducedMotion={reducedMotion}
          />
        ))}
      </div>
    </div>
  );
}

interface ProgressSegmentProps {
  readonly state: 'past' | 'active' | 'future';
  readonly reducedMotion: boolean;
}

function ProgressSegment({ state, reducedMotion }: ProgressSegmentProps) {
  return (
    <div className='relative h-[3px] flex-1 overflow-hidden rounded-full bg-black/10'>
      {state === 'past' ? <div className='h-full w-full bg-black' /> : null}
      {state === 'active' ? (
        reducedMotion ? (
          <div className='h-full w-1/2 bg-black' />
        ) : (
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: SLIDE_MS / 1000, ease: 'linear' }}
            className='h-full bg-black'
          />
        )
      ) : null}
    </div>
  );
}
