'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { SHELL_H2_CLASS } from '@/components/marketing/artist-profile/ArtistProfileSectionHeader';
import { ProductScreenshotFrame } from '@/components/marketing/ProductScreenshotFrame';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

interface AuthBrandPanelProps {
  readonly className?: string;
  /** Kept for back-compat with existing call sites; only 'page' is rendered. */
  readonly variant?: 'page' | 'image-only' | 'v1';
}

const SLIDE_MS = 5500;

/**
 * All slides share a 16:10 aspect ratio so the floating device frame
 * doesn't shift size when the carousel advances.
 */
const SLIDES = [
  'dashboard-releases-sidebar-desktop',
  'dashboard-audience-desktop',
  'public-profile-desktop',
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
      {/* Spacer above the floating screenshot. */}
      <div className='min-h-0 flex-1' />

      {/* Floating product screenshot — same device frame as the homepage hero. */}
      <div className='relative mx-8 sm:mx-10'>
        <AnimatePresence mode='sync'>
          <motion.div
            key={slide}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: reducedMotion ? 0 : 0.32,
              ease: 'easeOut',
            }}
          >
            <ProductScreenshotFrame
              scenarioId={slide}
              sizes='(min-width: 1280px) 540px, (min-width: 1024px) 44vw, 88vw'
              priority={index === 0}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Spacer pushes the headline + bars to the bottom of the card. */}
      <div className='min-h-0 flex-1' />

      <div className='relative z-10 px-8 pb-5 sm:px-10 sm:pb-6'>
        <h2 className={cn(SHELL_H2_CLASS, 'text-balance text-black')}>
          Built for Artists.
        </h2>
      </div>

      {/* Segmented progress bars — one per slide, side-by-side. */}
      <div
        aria-hidden='true'
        className='relative z-10 flex gap-1.5 px-8 pb-7 sm:px-10 sm:pb-8'
      >
        {SLIDES.map((s, i) => (
          <ProgressSegment
            key={s}
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
