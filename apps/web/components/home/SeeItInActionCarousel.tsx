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
      className='section-spacing-linear overflow-hidden'
      style={{
        backgroundColor: 'var(--linear-bg-page)',
        borderTop: '1px solid var(--linear-border-subtle)',
      }}
    >
      <div className='max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8'>
        <h2
          className='text-center'
          style={{
            fontSize: 'var(--linear-h2-size)',
            fontWeight: 'var(--linear-font-weight-medium)',
            lineHeight: 'var(--linear-h2-leading)',
            letterSpacing: 'var(--linear-h2-tracking)',
            color: 'var(--linear-text-primary)',
            marginBottom: 'var(--linear-space-12)',
          }}
        >
          See it in action
        </h2>
      </div>

      <div className='relative'>
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
            gap: 'var(--linear-space-6)',
            transform: `translateX(-${scrollOffset}px)`,
            transition: isVisible ? 'transform 0.1s linear' : 'none',
          }}
        >
          {extendedCreators.map((creator, index) => (
            <div
              key={`${creator.id}-${index}`}
              className='relative w-[120px] h-[120px] shrink-0'
            >
              <Image
                src={creator.src}
                alt={`${creator.name}'s avatar`}
                fill
                sizes='120px'
                placeholder='blur'
                blurDataURL={BLUR_DATA_URL}
                loading={index < 12 ? 'eager' : 'lazy'}
                className='rounded-full object-cover transition-colors duration-150'
                style={{
                  border: '1px solid var(--linear-border-subtle)',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
