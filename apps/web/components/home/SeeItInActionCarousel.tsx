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
      className='section-spacing-linear overflow-hidden bg-[var(--linear-bg-page)]'
    >
      <div className='w-full px-5 sm:px-6 lg:px-[var(--linear-container-padding)] max-w-[var(--linear-container-max)] mx-auto heading-gap-linear'>
        <h2 className='text-center marketing-h2-linear text-[var(--linear-text-primary)]'>
          See it in action
        </h2>
      </div>

      <div className='relative mt-12'>
        {/* Fade edges for premium feel */}
        <div
          className='absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none'
          style={{
            background:
              'linear-gradient(to right, var(--linear-bg-page), transparent)',
          }}
        />
        <div
          className='absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none'
          style={{
            background:
              'linear-gradient(to left, var(--linear-bg-page), transparent)',
          }}
        />

        {/* Scrolling track - driven by page scroll */}
        <div
          className='flex will-change-transform motion-reduce:transform-none'
          style={{
            width: 'max-content',
            gap: 'var(--linear-gap-cards)',
            transform: `translateX(-${scrollOffset}px)`,
            transition: isVisible ? 'transform 0.1s linear' : 'none',
          }}
        >
          {extendedCreators.map((creator, index) => (
            <div
              key={`${creator.id}-${index}`}
              className='relative flex flex-col gap-3 group'
            >
              <div
                className='relative w-[200px] h-[280px] shrink-0 overflow-hidden rounded-[var(--linear-radius-lg)]'
                style={{ boxShadow: 'var(--linear-shadow-card)' }}
              >
                <Image
                  src={creator.src}
                  alt={`${creator.name}'s avatar`}
                  fill
                  sizes='200px'
                  placeholder='blur'
                  blurDataURL={BLUR_DATA_URL}
                  loading={index < 12 ? 'eager' : 'lazy'}
                  className='object-cover transition-transform duration-500 group-hover:scale-105'
                />
                {/* Gradient overlay to make text readable */}
                <div className='absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent opacity-60 transition-opacity duration-300 group-hover:opacity-80' />

                {/* Profile info overlay */}
                <div className='absolute bottom-0 left-0 w-full p-4 flex flex-col gap-1'>
                  <span className='text-[var(--linear-text-inverse)] font-[var(--linear-font-weight-medium)] text-[var(--linear-body-size)] truncate drop-shadow-md'>
                    {creator.name}
                  </span>
                  {creator.tagline && (
                    <span className='text-[var(--linear-text-inverse)]/80 text-[var(--linear-label-size)] truncate'>
                      {creator.tagline}
                    </span>
                  )}
                </div>

                {/* Inner border for premium feel */}
                <div
                  className='absolute inset-0 rounded-[var(--linear-radius-lg)] pointer-events-none'
                  style={{ border: '1px solid rgba(255,255,255,0.15)' }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
