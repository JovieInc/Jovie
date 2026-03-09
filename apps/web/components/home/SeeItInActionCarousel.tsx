'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeaturedCreator } from '@/lib/featured-creators';

// Inline blur placeholder (no network request)
const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExYTFhIi8+PC9zdmc+';

interface Props
  extends Readonly<{
    readonly creators: FeaturedCreator[];
  }> {}

/**
 * Client component for scroll-driven avatar carousel.
 * Performance optimized with:
 * - Intersection Observer (pauses when off-screen)
 * - RAF throttling for scroll updates
 * - Blur placeholders for instant perceived load
 * - Eager/lazy loading split
 */
export function SeeItInActionCarousel({ creators }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const rafRef = useRef<number | null>(null);

  // Intersection Observer - only animate when visible
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '100px' } // Start slightly before visible
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // Scroll handler with RAF throttling
  const handleScroll = useCallback(() => {
    if (!sectionRef.current || !isVisible) return;

    // Cancel pending RAF
    if (rafRef.current) {
      globalThis.cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = globalThis.requestAnimationFrame(() => {
      const section = sectionRef.current;
      if (!section) return;

      const rect = section.getBoundingClientRect();
      const windowHeight = globalThis.innerHeight;
      const sectionHeight = rect.height;
      const scrollRange = windowHeight + sectionHeight;
      const scrollPosition = windowHeight - rect.top;
      const progress = Math.max(0, Math.min(1, scrollPosition / scrollRange));

      const maxOffset = 600;
      setScrollOffset(progress * maxOffset);
    });
  }, [isVisible]);

  // Scroll listener - only active when visible
  useEffect(() => {
    if (!isVisible) return;

    globalThis.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial calculation

    return () => {
      globalThis.removeEventListener('scroll', handleScroll);
      if (rafRef.current) {
        globalThis.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isVisible, handleScroll]);

  // Triple creators for seamless scroll
  const extendedCreators = [...creators, ...creators, ...creators];

  return (
    <section
      ref={sectionRef}
      className='section-spacing-linear-sm overflow-hidden bg-[var(--linear-bg-page)]'
    >
      {/* Gradient separator */}
      <div
        aria-hidden='true'
        className='mb-12 h-px max-w-lg mx-auto'
        style={{
          background:
            'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
        }}
      />

      <div className='w-full px-5 sm:px-6 lg:px-[var(--linear-container-padding)] max-w-[var(--linear-content-max)] mx-auto'>
        <div className='flex flex-col items-center text-center gap-5'>
          <h2 className='marketing-h2-linear text-[color:var(--linear-text-primary)]'>
            See it in action
          </h2>
          <p className='max-w-md marketing-lead-linear text-[color:var(--linear-text-secondary)]'>
            Real profiles, real artists. Scroll through to see how creators use
            Jovie.
          </p>
        </div>
      </div>

      <div className='relative mt-14'>
        {/* Fade edges */}
        <div
          className='absolute left-0 top-0 bottom-0 w-40 z-10 pointer-events-none'
          style={{
            background:
              'linear-gradient(to right, var(--linear-bg-page), transparent)',
          }}
        />
        <div
          className='absolute right-0 top-0 bottom-0 w-40 z-10 pointer-events-none'
          style={{
            background:
              'linear-gradient(to left, var(--linear-bg-page), transparent)',
          }}
        />

        {/* Scrolling track — scroll-driven */}
        <div
          className='flex will-change-transform motion-reduce:transform-none'
          style={{
            width: 'max-content',
            gap: '16px',
            transform: `translateX(-${scrollOffset}px)`,
            transition: isVisible ? 'transform 0.1s linear' : 'none',
          }}
        >
          {extendedCreators.map((creator, index) => (
            <div
              key={`${creator.id}-${index}`}
              className='relative flex flex-col group'
            >
              <div
                className='relative w-[200px] h-[280px] shrink-0 overflow-hidden rounded-xl'
                style={{
                  boxShadow: [
                    '0 0 0 1px rgba(255,255,255,0.03)',
                    '0 8px 40px rgba(0,0,0,0.35)',
                    '0 24px 80px rgba(0,0,0,0.25)',
                  ].join(', '),
                }}
              >
                <Image
                  src={creator.src}
                  alt={`${creator.name}'s profile`}
                  fill
                  sizes='200px'
                  placeholder='blur'
                  blurDataURL={BLUR_DATA_URL}
                  loading={index < 12 ? 'eager' : 'lazy'}
                  className='object-cover'
                />

                {/* Subtle vignette */}
                <div
                  className='absolute inset-0 pointer-events-none'
                  style={{
                    background:
                      'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)',
                  }}
                />

                {/* Glass edge — shine border */}
                <div
                  className='absolute inset-0 rounded-xl pointer-events-none'
                  style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                />

                {/* Top edge highlight */}
                <div
                  className='absolute inset-x-0 top-0 h-px pointer-events-none'
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, rgba(255,255,255,0.10) 30%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.10) 70%, transparent)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
