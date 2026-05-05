'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
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
        // App-shell content surface elevation (matches `--linear-bg-surface-0`
        // = `--linear-app-content-surface` in Linear dark mode). 12px radius
        // matches the app shell frame so this reads as an extension of the
        // shell. Hex-pinned because auth is dark regardless of root theme.
        'auth-showcase-panel relative flex h-full min-h-[34rem] flex-col overflow-hidden rounded-[12px] bg-[#0f1011] text-white',
        'border border-white/[0.05]',
        'lg:min-h-[calc(100svh-1rem)]',
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

      {/* Stage with reserved 16:10 space — slides crossfade absolutely so
          they overlap (no layout glitch on slide change). */}
      <div className='relative mx-8 aspect-[16/10] sm:mx-10'>
        <AnimatePresence initial={false} mode='sync'>
          <motion.div
            key={slide}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: reducedMotion ? 0 : 0.5,
              ease: [0.22, 1, 0.36, 1],
            }}
            className='absolute inset-0'
          >
            <ProductScreenshotFrame
              scenarioId={slide}
              sizes='(min-width: 1280px) 540px, (min-width: 1024px) 44vw, 88vw'
              priority={index === 0}
              fill
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Spacer pushes the headline + bars to the bottom of the card. */}
      <div className='min-h-0 flex-1' />

      <div className='relative z-10 px-8 pb-4 sm:px-10'>
        <h2 className='text-balance text-[clamp(1.5rem,2.6vw,2rem)] font-[680] leading-[1.05] tracking-[-0.025em] text-white'>
          Built for Artists.
        </h2>
      </div>

      {/* Segmented progress bars — thicker, side-by-side. */}
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
    <div className='relative h-[5px] flex-1 overflow-hidden rounded-full bg-white/12'>
      {state === 'past' ? <div className='h-full w-full bg-white' /> : null}
      {state === 'active' ? (
        reducedMotion ? (
          <div className='h-full w-1/2 bg-white' />
        ) : (
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: SLIDE_MS / 1000, ease: 'linear' }}
            className='h-full bg-white'
          />
        )
      ) : null}
    </div>
  );
}
