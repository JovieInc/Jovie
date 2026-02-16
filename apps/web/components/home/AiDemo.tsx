'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Segment {
  text: string;
  highlight?: boolean;
}

interface Demo {
  prompt: string;
  segments: Segment[];
}

const DEMOS: Demo[] = [
  {
    prompt: '> Write me a bio for a press kit',
    segments: [
      { text: 'Tim White', highlight: true },
      { text: ' is an independent artist based in ' },
      { text: 'Los Angeles', highlight: true },
      {
        text: ' whose catalog spans singles, EPs, and full-length albums since ',
      },
      { text: 'his 2018 debut single The Sound', highlight: true },
      { text: '. Across ' },
      { text: '21 releases and 4 projects', highlight: true },
      { text: ', he has accumulated ' },
      { text: '1.2M streams', highlight: true },
      { text: ' across platforms and earned placements on ' },
      {
        text: 'New Music Friday, Indie Pop, and Alternative Rising',
        highlight: true,
      },
      { text: '.' },
    ],
  },
  {
    prompt: '> Generate a press release for Signals',
    segments: [
      { text: 'FOR IMMEDIATE RELEASE', highlight: true },
      { text: ' — ' },
      { text: 'Tim White', highlight: true },
      { text: ' announces the release of ' },
      { text: 'Signals', highlight: true },
      {
        text: ', a 12-track album marking his most ambitious project to date. Produced across ',
      },
      { text: 'three continents', highlight: true },
      { text: ', the album features collaborations with ' },
      { text: '6 producers', highlight: true },
      {
        text: ' and explores themes of distance, connection, and digital intimacy.',
      },
    ],
  },
  {
    prompt: '> How are my streams trending this month?',
    segments: [
      { text: 'Your streams are up ' },
      { text: '23% month-over-month', highlight: true },
      { text: '. ' },
      { text: 'The Sound', highlight: true },
      { text: ' is driving ' },
      { text: '62%', highlight: true },
      { text: ' of total volume, likely from its placement on ' },
      { text: 'Alternative Rising', highlight: true },
      { text: ' (added Feb 3). ' },
      { text: 'Signals', highlight: true },
      { text: ' tracks are up ' },
      { text: '8%', highlight: true },
      { text: ' collectively, steady organic growth.' },
    ],
  },
];

const SEGMENT_DELAY_MIN = 80;
const SEGMENT_DELAY_MAX = 140;
const PAUSE_BETWEEN_DEMOS = 6000;

function randomDelay() {
  return (
    SEGMENT_DELAY_MIN + Math.random() * (SEGMENT_DELAY_MAX - SEGMENT_DELAY_MIN)
  );
}

export function AiDemo() {
  const [demoIndex, setDemoIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const currentDemo = DEMOS[demoIndex];

  // Check reduced motion preference
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const startTyping = useCallback(() => {
    setVisibleCount(0);
    setIsTyping(true);
  }, []);

  // IntersectionObserver to trigger first animation on scroll-in
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !hasStarted) {
          setHasStarted(true);
          if (prefersReducedMotion) {
            // Show all segments instantly
            if (currentDemo) setVisibleCount(currentDemo.segments.length);
          } else {
            startTyping();
          }
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasStarted, startTyping, prefersReducedMotion, currentDemo]);

  // Typing animation: reveal segments one at a time
  useEffect(() => {
    if (!isTyping || isPaused || prefersReducedMotion) return;
    if (!currentDemo) return;

    if (visibleCount >= currentDemo.segments.length) {
      setIsTyping(false);
      // Pause then advance to next demo
      timeoutRef.current = setTimeout(() => {
        const nextIndex = (demoIndex + 1) % DEMOS.length;
        setDemoIndex(nextIndex);
        setVisibleCount(0);
        setIsTyping(true);
      }, PAUSE_BETWEEN_DEMOS);
      return;
    }

    timeoutRef.current = setTimeout(() => {
      setVisibleCount(prev => prev + 1);
    }, randomDelay());

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [
    isTyping,
    visibleCount,
    currentDemo,
    isPaused,
    prefersReducedMotion,
    demoIndex,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
    if (isPaused && timeoutRef.current) {
      // Resuming — restart typing if it was in progress
      clearTimeout(timeoutRef.current);
      if (isTyping) {
        setVisibleCount(prev => prev); // trigger re-render
      }
    }
  }, [isPaused, isTyping]);

  // For reduced motion: cycle through demos without animation
  const showNextDemo = useCallback(() => {
    const nextIndex = (demoIndex + 1) % DEMOS.length;
    setDemoIndex(nextIndex);
    const nextDemo = DEMOS[nextIndex];
    if (nextDemo) setVisibleCount(nextDemo.segments.length);
  }, [demoIndex]);

  return (
    <figure
      ref={containerRef}
      aria-label='AI writing demo'
      className='rounded-xl overflow-hidden border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-0)] font-sans'
    >
      <style>{`
        @keyframes segmentIn {
          from {
            opacity: 0;
            filter: blur(4px);
          }
          to {
            opacity: 1;
            filter: blur(0);
          }
        }
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ai-demo-segment { animation: none !important; }
          .ai-demo-cursor { animation: none !important; }
        }
      `}</style>

      {/* Browser chrome */}
      <div className='flex items-center gap-2 px-3.5 py-2.5 border-b border-[var(--linear-border-subtle)]'>
        <div className='flex gap-[5px]'>
          <span className='w-2 h-2 rounded-full bg-[#2a2a2a]' />
          <span className='w-2 h-2 rounded-full bg-[#2a2a2a]' />
          <span className='w-2 h-2 rounded-full bg-[#2a2a2a]' />
        </div>
        <div className='flex-1 text-center text-xs text-[var(--linear-text-tertiary)]'>
          Jovie AI
        </div>
        {/* Pause/Play toggle */}
        <button
          type='button'
          onClick={prefersReducedMotion ? showNextDemo : togglePause}
          aria-label={
            prefersReducedMotion
              ? 'Show next demo'
              : isPaused
                ? 'Resume demo'
                : 'Pause demo'
          }
          className='focus-ring w-6 h-6 flex items-center justify-center rounded text-[var(--linear-text-tertiary)] hover:text-[var(--linear-text-secondary)] transition-colors'
        >
          {prefersReducedMotion ? (
            <svg
              viewBox='0 0 16 16'
              fill='currentColor'
              className='w-3 h-3'
              aria-hidden='true'
            >
              <path d='M4 2l10 6-10 6V2z' />
            </svg>
          ) : isPaused ? (
            <svg
              viewBox='0 0 16 16'
              fill='currentColor'
              className='w-3 h-3'
              aria-hidden='true'
            >
              <path d='M4 2l10 6-10 6V2z' />
            </svg>
          ) : (
            <svg
              viewBox='0 0 16 16'
              fill='currentColor'
              className='w-3 h-3'
              aria-hidden='true'
            >
              <rect x='2' y='2' width='4' height='12' />
              <rect x='10' y='2' width='4' height='12' />
            </svg>
          )}
        </button>
      </div>

      {/* Demo content */}
      <div className='px-5 pt-5 pb-6'>
        {/* Prompt */}
        {currentDemo && (
          <div className='font-mono text-sm text-[var(--linear-text-tertiary)] mb-4'>
            {currentDemo.prompt}
          </div>
        )}

        {/* Response */}
        <output
          aria-live='polite'
          className='block text-sm leading-[1.7] text-[var(--linear-text-secondary)] min-h-[80px]'
        >
          {currentDemo?.segments.map((segment, i) => {
            if (i >= visibleCount) return null;
            return (
              <span
                key={`${demoIndex}-${segment.text.slice(0, 20)}`}
                className='ai-demo-segment'
                style={{
                  animation: prefersReducedMotion
                    ? 'none'
                    : 'segmentIn 0.3s ease forwards',
                  ...(segment.highlight
                    ? { color: 'rgb(52 211 153)', fontWeight: 500 }
                    : {}),
                }}
              >
                {segment.text}
              </span>
            );
          })}

          {/* Blinking cursor */}
          {hasStarted && !prefersReducedMotion && (
            <span
              className='ai-demo-cursor inline-block w-[7px] h-[15px] bg-[var(--linear-text-primary)] ml-0.5 align-text-bottom'
              style={{
                animation: 'cursorBlink 1s step-end infinite',
              }}
              aria-hidden='true'
            />
          )}
        </output>
      </div>
    </figure>
  );
}
