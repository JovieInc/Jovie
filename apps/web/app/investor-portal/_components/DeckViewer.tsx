'use client';

import DOMPurify from 'isomorphic-dompurify';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Slide {
  readonly title: string;
  readonly html: string;
}

interface DeckViewerProps {
  readonly slides: Slide[];
}

const deckButtonClass = cn(
  'flex items-center gap-1.5 rounded-[var(--radius-default)] px-3 py-1.5',
  'text-[length:var(--text-sm)] font-medium text-[var(--color-text-tertiary-token)]',
  'hover:bg-[var(--color-interactive-hover)] hover:text-[var(--color-text-secondary-token)]',
  'active:scale-[0.97] focus-ring-themed transition-colors',
  'disabled:opacity-30 disabled:cursor-not-allowed'
);

/**
 * Pitch deck viewer — 16:9 aspect ratio cards with slide navigation.
 * Arrow keys, touch swipe, buttons, slide dots. Fullscreen toggle.
 * Print-optimized CSS for PDF download via globalThis.print().
 *
 * Slides are loaded server-side and passed as props from page.tsx.
 */
export function DeckViewer({ slides }: DeckViewerProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const goNext = useCallback(() => {
    setCurrentSlide(prev => Math.min(prev + 1, slides.length - 1));
  }, [slides.length]);

  const goPrev = useCallback(() => {
    setCurrentSlide(prev => Math.max(prev - 1, 0));
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      } else if (e.key === 'f' && !e.metaKey && !e.ctrlKey) {
        toggleFullscreen();
      }
    }

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, isFullscreen, toggleFullscreen]);

  // Touch swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      // Only trigger swipe if horizontal movement > vertical and > threshold
      if (Math.abs(deltaX) > 30 && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX < 0) {
          goNext();
        } else {
          goPrev();
        }
      }
    },
    [goNext, goPrev]
  );

  if (slides.length === 0) {
    return (
      <div
        className='flex aspect-video items-center justify-center rounded-[var(--radius-xl)]'
        style={{
          background: 'var(--color-bg-surface-1)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <p className='text-[length:var(--text-sm)] text-[var(--color-text-quaternary-token)]'>
          No slides yet — check back soon
        </p>
      </div>
    );
  }

  const slide = slides[currentSlide];
  const isFirst = currentSlide === 0;
  const isLast = currentSlide === slides.length - 1;

  const slideDots = slides.length > 1 && (
    <div className='flex items-center justify-center gap-1.5'>
      {slides.map((_, i) => (
        <button
          key={`dot-${slides[i].title}`}
          type='button'
          onClick={() => setCurrentSlide(i)}
          aria-label={`Go to slide ${i + 1}`}
          className={cn(
            'h-1.5 w-1.5 rounded-full transition-colors',
            i === currentSlide
              ? 'bg-[var(--color-accent)]'
              : 'bg-[var(--color-bg-surface-2)] hover:bg-[var(--color-text-quaternary-token)]'
          )}
        />
      ))}
    </div>
  );

  const slideContent = (
    <>
      {/* Slide card — 16:9 aspect ratio with touch support */}
      <div
        className='relative aspect-video overflow-hidden rounded-[var(--radius-xl)] p-6 sm:p-8 lg:p-12'
        style={{
          background: 'var(--color-bg-surface-1)',
          boxShadow: 'var(--shadow-card)',
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <h2
          className='mb-4 text-[length:var(--text-xl)] font-bold text-[var(--color-text-primary-token)] sm:text-[length:var(--text-2xl)]'
          style={{
            letterSpacing: 'var(--tracking-tight)',
            fontFeatureSettings: 'var(--font-features)',
          }}
        >
          {slide.title}
        </h2>
        <div
          className='investor-prose max-h-[calc(100%-3.5rem)] overflow-y-auto text-[length:var(--text-sm)] leading-[var(--leading-relaxed)] text-[var(--color-text-secondary-token)] sm:text-[length:var(--text-base)]'
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized with DOMPurify
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(slide.html) }}
        />
      </div>

      {/* Navigation controls */}
      <div className='mt-4 flex items-center justify-between print:hidden'>
        {/* Prev */}
        <button
          type='button'
          onClick={goPrev}
          disabled={isFirst}
          aria-label='Previous slide'
          className={deckButtonClass}
        >
          <ChevronLeft className='h-4 w-4' aria-hidden='true' />
          <span className='max-sm:hidden sm:inline'>Prev</span>
        </button>

        {/* Center: dots + counter */}
        <div className='flex flex-col items-center gap-1'>
          {slideDots}
          <span className='text-[length:var(--text-xs)] text-[var(--color-text-quaternary-token)]'>
            {currentSlide + 1} / {slides.length}
          </span>
        </div>

        {/* Right controls */}
        <div className='flex items-center gap-1'>
          <button
            type='button'
            onClick={() => globalThis.print()}
            aria-label='Download as PDF'
            className={deckButtonClass}
          >
            <Download className='h-4 w-4' aria-hidden='true' />
            <span className='max-sm:hidden sm:inline'>PDF</span>
          </button>

          <button
            type='button'
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className={deckButtonClass}
          >
            {isFullscreen ? (
              <Minimize2 className='h-4 w-4' aria-hidden='true' />
            ) : (
              <Maximize2 className='h-4 w-4' aria-hidden='true' />
            )}
          </button>

          <button
            type='button'
            onClick={goNext}
            disabled={isLast}
            aria-label='Next slide'
            className={deckButtonClass}
          >
            <span className='max-sm:hidden sm:inline'>Next</span>
            <ChevronRight className='h-4 w-4' aria-hidden='true' />
          </button>
        </div>
      </div>
    </>
  );

  if (isFullscreen) {
    return (
      <div
        className='fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 transition-opacity duration-200 sm:p-8'
        style={{ background: 'var(--color-bg-base)' }}
      >
        <div className='w-full max-w-5xl'>{slideContent}</div>
      </div>
    );
  }

  return slideContent;
}
