'use client';

import { AnimatePresence, motion } from 'motion/react';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { ProductScreenshotFrame } from '@/components/marketing/ProductScreenshotFrame';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

interface AuthBrandPanelProps {
  readonly className?: string;
}

const SLIDE_MS = 5500;

interface AuthShowcaseSlide {
  readonly id: string;
  readonly scenarioId: string;
  readonly description: string;
  readonly ambient: {
    readonly primary: string;
    readonly secondary: string;
    readonly accent: string;
  };
}

/**
 * All slides share a 16:10 aspect ratio so the floating device frame
 * doesn't shift size when the carousel advances.
 */
const SLIDES: readonly AuthShowcaseSlide[] = [
  {
    id: 'release-calendar',
    scenarioId: 'dashboard-releases-sidebar-desktop',
    description:
      'Plan releases, links, and launch work from one calm artist workspace.',
    ambient: {
      primary: 'rgba(82, 142, 232, 0.42)',
      secondary: 'rgba(99, 194, 215, 0.22)',
      accent: 'rgba(198, 122, 77, 0.16)',
    },
  },
  {
    id: 'audience-crm',
    scenarioId: 'dashboard-audience-desktop',
    description:
      'See every listener, buyer, and contact without leaving the flow.',
    ambient: {
      primary: 'rgba(93, 169, 201, 0.34)',
      secondary: 'rgba(106, 91, 214, 0.22)',
      accent: 'rgba(237, 178, 92, 0.13)',
    },
  },
  {
    id: 'artist-profile',
    scenarioId: 'public-profile-desktop',
    description:
      'Turn profile traffic into owned audience growth with fewer moving parts.',
    ambient: {
      primary: 'rgba(126, 119, 230, 0.34)',
      secondary: 'rgba(70, 154, 220, 0.2)',
      accent: 'rgba(218, 111, 137, 0.14)',
    },
  },
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
  const ambientStyle = {
    '--auth-ambient-primary': slide.ambient.primary,
    '--auth-ambient-secondary': slide.ambient.secondary,
    '--auth-ambient-accent': slide.ambient.accent,
  } as CSSProperties;

  return (
    <section
      aria-label='Product preview'
      aria-roledescription='carousel'
      className='absolute inset-0 flex flex-col'
      style={ambientStyle}
    >
      <div aria-hidden='true' className='absolute inset-0 overflow-hidden'>
        <div className='absolute -left-[18%] top-[6%] h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle_at_center,var(--auth-ambient-primary),transparent_68%)] blur-3xl opacity-70' />
        <div className='absolute -right-[20%] bottom-[4%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle_at_center,var(--auth-ambient-secondary),transparent_70%)] blur-3xl opacity-65' />
        <div className='absolute inset-x-[12%] top-[31%] h-36 rounded-full bg-[radial-gradient(ellipse_at_center,var(--auth-ambient-accent),transparent_68%)] blur-2xl opacity-70' />
        <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),transparent_34%,rgba(0,0,0,0.38))]' />
      </div>

      {/* Spacer above the floating screenshot. */}
      <div className='min-h-0 flex-1' />

      {/* Stage with reserved 16:10 space — slides crossfade absolutely so
          they overlap (no layout glitch on slide change). */}
      <div className='relative z-10 mx-8 aspect-[16/10] sm:mx-10'>
        <div
          aria-hidden='true'
          className='absolute -inset-6 rounded-[2rem] bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_28px_90px_rgba(0,0,0,0.28)] backdrop-blur-[2px]'
        />
        <AnimatePresence initial={false} mode='sync'>
          <motion.div
            key={slide.id}
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
              scenarioId={slide.scenarioId}
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
        <div className='relative mt-3 min-h-[3.1rem] max-w-[28rem] overflow-hidden'>
          <AnimatePresence initial={false} mode='wait'>
            <motion.p
              key={slide.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: reducedMotion ? 0 : 0.28,
                ease: [0.22, 1, 0.36, 1],
              }}
              className='absolute inset-0 text-[14px] font-[400] leading-[1.55] tracking-[-0.01em] text-white/64'
            >
              {slide.description}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      {/* Segmented progress bars — thicker, side-by-side. */}
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
    </section>
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
