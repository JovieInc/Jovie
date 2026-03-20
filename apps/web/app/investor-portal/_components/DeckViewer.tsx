'use client';

import { useCallback, useEffect, useState } from 'react';

interface Slide {
  readonly title: string;
  readonly html: string;
}

interface DeckViewerProps {
  readonly slides: Slide[];
}

/**
 * Pitch deck viewer — 16:9 aspect ratio cards with slide navigation.
 * Arrow keys, buttons, slide counter. Fullscreen toggle.
 * Print-optimized CSS for PDF download via window.print().
 *
 * Slides are loaded server-side and passed as props from page.tsx.
 */
export function DeckViewer({ slides }: DeckViewerProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, isFullscreen, toggleFullscreen]);

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

  const slideContent = (
    <>
      {/* Slide card — 16:9 aspect ratio */}
      <div
        className='relative aspect-video overflow-hidden rounded-[var(--radius-xl)] p-8 sm:p-12'
        style={{
          background: 'var(--color-bg-surface-1)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <h2
          className='mb-4 text-[length:var(--text-2xl)] font-[680] text-[var(--color-text-primary-token)]'
          style={{
            letterSpacing: 'var(--tracking-tight)',
            fontFeatureSettings: 'var(--font-features)',
          }}
        >
          {slide.title}
        </h2>
        <div
          className='prose-investor text-[length:var(--text-base)] leading-[var(--leading-relaxed)] text-[var(--color-text-secondary-token)]'
          // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown HTML rendered server-side from trusted repo content
          dangerouslySetInnerHTML={{ __html: slide.html }}
        />
      </div>

      {/* Navigation controls */}
      <div className='mt-4 flex items-center justify-between print:hidden'>
        <button
          type='button'
          onClick={goPrev}
          disabled={isFirst}
          aria-label='Previous slide'
          className='rounded-[var(--radius-default)] px-3 py-1.5 text-[length:var(--text-sm)] font-[510] text-[var(--color-text-tertiary-token)] disabled:opacity-30'
        >
          ◄ Prev
        </button>

        <span className='text-[length:var(--text-sm)] text-[var(--color-text-quaternary-token)]'>
          {currentSlide + 1} / {slides.length}
        </span>

        <div className='flex items-center gap-2'>
          <button
            type='button'
            onClick={() => window.print()}
            aria-label='Download as PDF'
            className='rounded-[var(--radius-default)] px-3 py-1.5 text-[length:var(--text-sm)] font-[510] text-[var(--color-text-tertiary-token)]'
          >
            ↓ PDF
          </button>

          <button
            type='button'
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className='rounded-[var(--radius-default)] px-3 py-1.5 text-[length:var(--text-sm)] font-[510] text-[var(--color-text-tertiary-token)]'
          >
            {isFullscreen ? '✕ Exit' : '⛶ Full'}
          </button>

          <button
            type='button'
            onClick={goNext}
            disabled={isLast}
            aria-label='Next slide'
            className='rounded-[var(--radius-default)] px-3 py-1.5 text-[length:var(--text-sm)] font-[510] text-[var(--color-text-tertiary-token)] disabled:opacity-30'
          >
            Next ►
          </button>
        </div>
      </div>
    </>
  );

  if (isFullscreen) {
    return (
      <div
        className='fixed inset-0 z-[100] flex flex-col items-center justify-center p-8'
        style={{ background: 'var(--color-bg-base)' }}
      >
        <div className='w-full max-w-5xl'>{slideContent}</div>
      </div>
    );
  }

  return slideContent;
}
