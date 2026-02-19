'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Container } from '@/components/site/Container';

const EXAMPLE_PROFILES = [
  {
    name: 'Tim White',
    subtitle: 'Artist',
    artGradient: 'linear-gradient(135deg, #2a1f3d, #1a1a2e, #1f2d1a)',
    initial: 'T',
    trackTitle: 'Never Say A Word',
    trackMeta: 'Single · 2024',
    accent: '#4ade80',
  },
  {
    name: 'Maya Rivers',
    subtitle: 'Artist',
    artGradient: 'linear-gradient(135deg, #1f2d1a, #2a3a1a, #1a2d1f)',
    initial: 'M',
    trackTitle: 'Golden Hour',
    trackMeta: 'EP · 2025',
    accent: '#8b5cf6',
  },
  {
    name: 'Kai Nomura',
    subtitle: 'Artist',
    artGradient: 'linear-gradient(135deg, #2d1f1a, #3a2a1a, #2d1a1f)',
    initial: 'K',
    trackTitle: 'Drift',
    trackMeta: 'Album · 2025',
    accent: '#3b82f6',
  },
  {
    name: 'Jules Park',
    subtitle: 'Artist',
    artGradient: 'linear-gradient(135deg, #1a1f2d, #1a2a3a, #1f1a2d)',
    initial: 'J',
    trackTitle: 'Neon Sleep',
    trackMeta: 'Single · 2026',
    accent: '#f59e0b',
  },
  {
    name: 'Sasha Veil',
    subtitle: 'Artist',
    artGradient: 'linear-gradient(135deg, #2d1a2a, #3a1a2a, #2a1a2d)',
    initial: 'S',
    trackTitle: 'Phantom Limb',
    trackMeta: 'EP · 2025',
    accent: '#ec4899',
  },
];

const ROTATION_INTERVAL = 4000;

export function ExampleProfilesCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const resetProgress = useCallback(() => {
    const el = progressRef.current;
    if (!el || prefersReducedMotion) return;
    el.style.animation = 'none';
    // Force reflow so the animation restarts from 0%
    el.getClientRects();
    el.style.animation = `carouselProgress ${ROTATION_INTERVAL}ms linear forwards`;
  }, [prefersReducedMotion]);

  const startAutoRotation = useCallback(() => {
    if (prefersReducedMotion) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % EXAMPLE_PROFILES.length);
    }, ROTATION_INTERVAL);
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion) return;
    startAutoRotation();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startAutoRotation, prefersReducedMotion]);

  useEffect(() => {
    resetProgress();
  }, [activeIndex, resetProgress]);

  const handleSelect = (index: number) => {
    setActiveIndex(index);
    startAutoRotation();
  };

  const profile = EXAMPLE_PROFILES[activeIndex];

  return (
    <section
      className='section-spacing-linear'
      style={{
        borderTop: '1px solid var(--linear-border-subtle)',
        backgroundColor: 'var(--linear-bg-page)',
      }}
    >
      <style>{`
        @keyframes carouselProgress {
          from { width: 0%; }
          to { width: 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .carousel-progress { animation: none !important; width: 100% !important; }
        }
      `}</style>

      <Container size='homepage'>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center'>
          {/* Left column */}
          <div>
            {/* Section label */}
            <p
              style={{
                fontSize: 'var(--linear-caption-size)',
                fontWeight: 'var(--linear-font-weight-medium)',
                color: 'var(--linear-text-secondary)',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.05em',
                marginBottom: 'var(--linear-space-3)',
              }}
            >
              Example profiles
            </p>
            <h2
              style={{
                fontSize: 'var(--linear-h2-size)',
                fontWeight: 'var(--linear-h2-weight)',
                lineHeight: 'var(--linear-h2-leading)',
                letterSpacing: 'var(--linear-h2-tracking)',
                color: 'var(--linear-text-primary)',
              }}
            >
              See it live.
            </h2>
            <p
              style={{
                fontSize: 'var(--linear-body-lg-size)',
                lineHeight: 'var(--linear-body-lg-leading)',
                color: 'var(--linear-text-secondary)',
                marginTop: '12px',
              }}
            >
              Every profile auto-generates from Spotify. Tap to preview.
            </p>

            {/* Avatar row */}
            <div className='flex items-center gap-3 mt-8'>
              {EXAMPLE_PROFILES.map((p, i) => (
                <button
                  key={p.name}
                  type='button'
                  onClick={() => handleSelect(i)}
                  className='relative rounded-full transition-all duration-200 focus-ring-themed'
                  style={{
                    width: 44,
                    height: 44,
                    opacity: i === activeIndex ? 1 : 0.5,
                    outline:
                      i === activeIndex
                        ? `2px solid ${p.accent}`
                        : '2px solid transparent',
                    outlineOffset: 2,
                  }}
                  aria-label={`View ${p.name}'s profile`}
                  aria-pressed={i === activeIndex}
                >
                  <div
                    className='w-full h-full rounded-full flex items-center justify-center text-sm font-semibold text-white'
                    style={{ background: p.artGradient }}
                  >
                    {p.initial}
                  </div>
                </button>
              ))}
            </div>

            {/* Progress bar */}
            <div
              className='mt-4 rounded-full overflow-hidden'
              style={{
                height: 2,
                backgroundColor: 'var(--linear-border-subtle)',
                maxWidth: EXAMPLE_PROFILES.length * (44 + 12),
              }}
            >
              <div
                ref={progressRef}
                className='carousel-progress h-full rounded-full'
                style={{
                  backgroundColor: profile.accent,
                  width: prefersReducedMotion ? '100%' : undefined,
                  animation: prefersReducedMotion
                    ? 'none'
                    : `carouselProgress ${ROTATION_INTERVAL}ms linear forwards`,
                }}
              />
            </div>
          </div>

          {/* Right column — profile preview card */}
          <div
            className='relative rounded-xl overflow-hidden'
            style={{
              backgroundColor: '#0D0E12',
              border: '1px solid var(--linear-border-subtle)',
              minHeight: 320,
            }}
          >
            {/* Subtle radial glow */}
            <div
              className='absolute inset-0 pointer-events-none'
              style={{
                background: `radial-gradient(ellipse at 50% 30%, color-mix(in srgb, ${profile.accent} 8%, transparent) 0%, transparent 70%)`,
              }}
            />
            <AnimatePresence mode='wait'>
              <motion.div
                key={activeIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: prefersReducedMotion ? 0 : 0.4,
                }}
                className='relative p-6 flex flex-col items-center text-center'
              >
                {/* Large avatar */}
                <div
                  className='rounded-full flex items-center justify-center text-xl font-semibold text-white shrink-0'
                  style={{
                    width: 64,
                    height: 64,
                    background: profile.artGradient,
                  }}
                >
                  {profile.initial}
                </div>
                <div
                  style={{
                    fontSize: 'var(--linear-body-size)',
                    fontWeight: 'var(--linear-font-weight-semibold)',
                    color: 'var(--linear-text-primary)',
                    marginTop: 12,
                  }}
                >
                  {profile.name}
                </div>
                <div
                  style={{
                    fontSize: 'var(--linear-caption-size)',
                    color: 'var(--linear-text-tertiary)',
                    marginTop: 2,
                  }}
                >
                  {profile.subtitle}
                </div>

                {/* Album art */}
                <div
                  className='mt-5 rounded-lg'
                  style={{
                    width: 140,
                    height: 140,
                    background: profile.artGradient,
                  }}
                />
                <div
                  style={{
                    fontSize: 'var(--linear-caption-size)',
                    fontWeight: 'var(--linear-font-weight-medium)',
                    color: 'var(--linear-text-primary)',
                    marginTop: 12,
                  }}
                >
                  {profile.trackTitle}
                </div>
                <div
                  style={{
                    fontSize: 'var(--linear-label-size)',
                    color: 'var(--linear-text-tertiary)',
                    marginTop: 2,
                  }}
                >
                  {profile.trackMeta}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </Container>
    </section>
  );
}
