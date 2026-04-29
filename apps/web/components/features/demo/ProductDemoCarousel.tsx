'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { BrowserFrame } from './BrowserFrame';

const SLIDES = [
  {
    id: 'profile',
    src: getMarketingExportImage('public-profile-desktop').publicUrl,
    caption: 'Your artist page, instantly',
    alt: 'Artist profile page with listen, tip, and tour CTAs',
  },
  {
    id: 'releases',
    src: getMarketingExportImage('dashboard-releases-sidebar-desktop')
      .publicUrl,
    caption: 'Every release, every platform',
    alt: 'Release dashboard showing smart link sidebar',
  },
  {
    id: 'audience',
    src: getMarketingExportImage('dashboard-audience-desktop').publicUrl,
    caption: 'Own your audience',
    alt: 'Fan CRM with tracked interactions and contact details',
  },
  {
    id: 'platforms',
    src: getMarketingExportImage('dashboard-release-sidebar-platforms-desktop')
      .publicUrl,
    caption: 'Smart links across every DSP',
    alt: 'Platform links auto-generated for Spotify, Apple Music, and more',
  },
] as const;

const SLIDE_DURATION_MS = 7500;

export function ProductDemoCarousel() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const advance = useCallback(() => {
    setCurrent(prev => (prev + 1) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(advance, SLIDE_DURATION_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [paused, current, advance]);

  const handleAdvance = useCallback(() => {
    advance();
    if (timerRef.current) clearInterval(timerRef.current);
  }, [advance]);

  const slide = SLIDES[current];
  const scale = prefersReducedMotion ? 1 : 1.03;

  return (
    <div className='relative w-full select-none'>
      <BrowserFrame>
        {/* clickable overlay for advancing */}
        <button
          type='button'
          className='relative block w-full text-left focus:outline-none'
          onClick={handleAdvance}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          aria-label='Next slide'
        >
          <div className='relative aspect-[1440/900] w-full overflow-hidden bg-black'>
            <AnimatePresence mode='wait'>
              <motion.div
                key={slide.id}
                className='absolute inset-0'
                initial={{ opacity: 0, scale: 1 }}
                animate={{ opacity: 1, scale }}
                exit={{ opacity: 0 }}
                transition={{
                  opacity: { duration: 0.5, ease: 'easeInOut' },
                  scale: {
                    duration: SLIDE_DURATION_MS / 1000,
                    ease: 'linear',
                  },
                }}
              >
                <Image
                  src={slide.src}
                  alt={slide.alt}
                  fill
                  className='object-cover object-top'
                  priority={current === 0}
                  sizes='(max-width: 768px) 100vw, 80rem'
                />
              </motion.div>
            </AnimatePresence>

            {/* Caption overlay */}
            <AnimatePresence mode='wait'>
              <motion.div
                key={`caption-${slide.id}`}
                className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-6 pb-6 pt-16'
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.4, delay: 0.3 }}
              >
                <p className='text-lg font-semibold tracking-tight text-white sm:text-xl md:text-2xl'>
                  {slide.caption}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </button>

        {/* Progress bar */}
        <div className='flex h-1 gap-px bg-white/5'>
          {SLIDES.map((s, i) => (
            <div key={s.id} className='relative flex-1 overflow-hidden'>
              {i === current && (
                <motion.div
                  className='absolute inset-y-0 left-0 bg-accent'
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{
                    duration: SLIDE_DURATION_MS / 1000,
                    ease: 'linear',
                  }}
                />
              )}
              {i < current && <div className='absolute inset-0 bg-accent' />}
            </div>
          ))}
        </div>
      </BrowserFrame>

      {/* Dot indicators */}
      <div className='mt-4 flex justify-center gap-2'>
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type='button'
            className={`size-2 rounded-full transition-colors ${
              i === current ? 'bg-white' : 'bg-white/30'
            }`}
            onClick={() => setCurrent(i)}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
