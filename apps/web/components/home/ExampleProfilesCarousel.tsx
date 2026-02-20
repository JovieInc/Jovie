'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Container } from '@/components/site/Container';

const EXAMPLE_PROFILES = [
  {
    name: 'Tim White',
    handle: '@timwhitemusic',
    subtitle: 'Artist · Producer',
    initial: 'T',
    accent: '#4ade80',
    artGradient: 'linear-gradient(135deg, #2a1f3d, #1a1a2e, #1f2d1a)',
    latestRelease: { title: 'Never Say A Word', type: 'Single', year: '2024' },
    socialCount: 6,
  },
  {
    name: 'Maya Rivers',
    handle: '@mayarivers',
    subtitle: 'Singer · Songwriter',
    initial: 'M',
    accent: '#8b5cf6',
    artGradient: 'linear-gradient(135deg, #1f2d1a, #2a3a1a, #1a2d1f)',
    latestRelease: { title: 'Golden Hour', type: 'EP', year: '2025' },
    socialCount: 5,
  },
  {
    name: 'Kai Nomura',
    handle: '@kainomura',
    subtitle: 'Producer · DJ',
    initial: 'K',
    accent: '#3b82f6',
    artGradient: 'linear-gradient(135deg, #2d1f1a, #3a2a1a, #2d1a1f)',
    latestRelease: { title: 'Drift', type: 'Album', year: '2025' },
    socialCount: 7,
  },
  {
    name: 'Jules Park',
    handle: '@julespark',
    subtitle: 'Artist · Multi-instrumentalist',
    initial: 'J',
    accent: '#f59e0b',
    artGradient: 'linear-gradient(135deg, #1a1f2d, #1a2a3a, #1f1a2d)',
    latestRelease: { title: 'Neon Sleep', type: 'Single', year: '2026' },
    socialCount: 4,
  },
  {
    name: 'Sasha Veil',
    handle: '@sashaveil',
    subtitle: 'Vocalist · Producer',
    initial: 'S',
    accent: '#ec4899',
    artGradient: 'linear-gradient(135deg, #2d1a2a, #3a1a2a, #2a1a2d)',
    latestRelease: { title: 'Phantom Limb', type: 'EP', year: '2025' },
    socialCount: 5,
  },
];

const ROTATION_INTERVAL = 4000;

/* ------------------------------------------------------------------ */
/*  Profile mockup — matches real Jovie profile page layout            */
/* ------------------------------------------------------------------ */
function ProfileMockupCard({
  profile,
}: {
  profile: (typeof EXAMPLE_PROFILES)[number];
}) {
  return (
    <div className='relative flex flex-col items-center px-8 py-10'>
      {/* Avatar */}
      <div
        className='rounded-full flex items-center justify-center text-xl font-semibold text-white shrink-0'
        style={{
          width: 72,
          height: 72,
          background: profile.artGradient,
          boxShadow: `0 0 0 2px rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.4)`,
        }}
      >
        {profile.initial}
      </div>

      {/* Name */}
      <div
        style={{
          fontSize: '16px',
          fontWeight: 500,
          color: 'var(--linear-text-primary)',
          marginTop: 14,
          letterSpacing: '-0.01em',
        }}
      >
        {profile.name}
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontSize: '11px',
          color: 'var(--linear-text-tertiary)',
          marginTop: 2,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.06em',
          fontWeight: 500,
        }}
      >
        {profile.subtitle}
      </div>

      {/* Latest release card */}
      <div
        className='flex items-center gap-3 w-full mt-6'
        style={{
          backgroundColor: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '10px',
          padding: '12px',
        }}
      >
        {/* Album art */}
        <div
          className='shrink-0 rounded-md'
          style={{
            width: 48,
            height: 48,
            background: profile.artGradient,
          }}
        />
        <div className='flex flex-col min-w-0 flex-1'>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--linear-text-primary)',
            }}
          >
            {profile.latestRelease.title}
          </span>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--linear-text-tertiary)',
              marginTop: 1,
            }}
          >
            {profile.latestRelease.type} · {profile.latestRelease.year}
          </span>
        </div>
        {/* Listen button */}
        <div
          className='shrink-0 flex items-center justify-center rounded-full'
          style={{
            width: 32,
            height: 32,
            backgroundColor: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: '11px',
            color: 'var(--linear-text-secondary)',
          }}
        >
          ▶
        </div>
      </div>

      {/* CTA button */}
      <div
        className='w-full mt-3 flex items-center justify-center rounded-full'
        style={{
          height: 40,
          fontSize: '13px',
          fontWeight: 500,
          color: '#000',
          backgroundColor: 'rgb(230,230,230)',
          letterSpacing: '-0.005em',
        }}
      >
        Listen Now
      </div>

      {/* Social icons row */}
      <div className='flex items-center gap-2 mt-5'>
        {Array.from({ length: Math.min(profile.socialCount, 5) }).map(
          (_, i) => (
            <div
              key={`social-${profile.name}-${i}`}
              className='rounded-full'
              style={{
                width: 28,
                height: 28,
                backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            />
          )
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export function ExampleProfilesCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const resetProgress = useCallback(() => {
    const el = progressRef.current;
    if (!el || prefersReducedMotion) return;
    el.style.animation = 'none';
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
            <p
              style={{
                fontSize: '13px',
                fontWeight: 510,
                color: 'var(--linear-text-tertiary)',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.08em',
                marginBottom: '12px',
              }}
            >
              Example profiles
            </p>
            <h2
              style={{
                fontSize: 'clamp(28px, 4vw, 48px)',
                fontWeight: 510,
                lineHeight: 1,
                letterSpacing: '-0.022em',
                color: 'var(--linear-text-primary)',
              }}
            >
              See it live.
            </h2>
            <p
              style={{
                fontSize: '15px',
                lineHeight: '24px',
                letterSpacing: '-0.011em',
                color: 'var(--linear-text-secondary)',
                marginTop: '12px',
                maxWidth: '360px',
              }}
            >
              Every profile auto-generates from Spotify. Tap to preview.
            </p>

            {/* Avatar selector row */}
            <div className='flex items-center gap-3 mt-8'>
              {EXAMPLE_PROFILES.map((p, i) => (
                <button
                  key={p.name}
                  type='button'
                  onClick={() => handleSelect(i)}
                  className='relative rounded-full transition-all duration-200 focus-ring-themed'
                  style={{
                    width: 40,
                    height: 40,
                    opacity: i === activeIndex ? 1 : 0.4,
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
                backgroundColor: 'rgba(255,255,255,0.06)',
                maxWidth: EXAMPLE_PROFILES.length * (40 + 12),
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

          {/* Right column — profile preview */}
          <div
            className='relative rounded-xl overflow-hidden'
            style={{
              backgroundColor: 'rgb(10,11,12)',
              border: '1px solid rgba(255,255,255,0.06)',
              boxShadow:
                '0 0 0 1px rgba(255,255,255,0.03), 0 4px 32px rgba(8,9,10,0.6)',
              maxWidth: 360,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            {/* Accent glow */}
            <div
              className='absolute inset-0 pointer-events-none'
              style={{
                background: `radial-gradient(ellipse at 50% 20%, color-mix(in srgb, ${profile.accent} 6%, transparent) 0%, transparent 70%)`,
              }}
            />
            <AnimatePresence mode='wait'>
              <motion.div
                key={activeIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.35 }}
                className='relative'
              >
                <ProfileMockupCard profile={profile} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </Container>
    </section>
  );
}
