'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

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
] as const;

const SEGMENT_DELAY_MIN = 80;
const SEGMENT_DELAY_MAX = 140;
const PAUSE_BETWEEN_DEMOS = 6000;

function randomDelay() {
  return (
    SEGMENT_DELAY_MIN +
    (crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) *
      (SEGMENT_DELAY_MAX - SEGMENT_DELAY_MIN)
  );
}

interface AiDemoProps {
  readonly className?: string;
  readonly variant?: 'default' | 'premium';
  readonly contextChips?: readonly string[];
}

export function AiDemo({
  className,
  variant = 'default',
  contextChips = [],
}: Readonly<AiDemoProps>) {
  const [demoIndex, setDemoIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const currentDemo = DEMOS[demoIndex];
  const isPremium = variant === 'premium';

  useEffect(() => {
    const mq = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
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

  const handleIntersection = useCallback(
    (entry: IntersectionObserverEntry | undefined) => {
      if (!entry?.isIntersecting || hasStarted) return;
      setHasStarted(true);
      if (prefersReducedMotion) {
        if (currentDemo) setVisibleCount(currentDemo.segments.length);
      } else {
        startTyping();
      }
    },
    [currentDemo, hasStarted, prefersReducedMotion, startTyping]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => handleIntersection(entry),
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersection]);

  const advanceTypingTick = useCallback(() => {
    if (!currentDemo) return;
    if (visibleCount >= currentDemo.segments.length) {
      setIsTyping(false);
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
  }, [currentDemo, demoIndex, visibleCount]);

  useEffect(() => {
    if (!isTyping || isPaused || prefersReducedMotion) return;
    advanceTypingTick();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [advanceTypingTick, isPaused, isTyping, prefersReducedMotion]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
    if (isPaused && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, [isPaused]);

  const showNextDemo = useCallback(() => {
    const nextIndex = (demoIndex + 1) % DEMOS.length;
    setDemoIndex(nextIndex);
    const nextDemo = DEMOS[nextIndex];
    if (nextDemo) setVisibleCount(nextDemo.segments.length);
  }, [demoIndex]);

  let toggleLabel = 'Pause demo';
  if (prefersReducedMotion) toggleLabel = 'Show next demo';
  else if (isPaused) toggleLabel = 'Resume demo';

  return (
    <figure
      ref={containerRef}
      aria-label='AI writing demo'
      className={cn(
        'overflow-hidden font-sans',
        isPremium
          ? 'rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(16,18,26,0.95),rgba(10,12,18,0.98))] shadow-[0_30px_80px_rgba(0,0,0,0.34),0_10px_24px_rgba(0,0,0,0.24)]'
          : 'rounded-t-xl rounded-b-none bg-surface-0 shadow-panel-ring',
        className
      )}
    >
      <style>{`
        @keyframes segmentIn {
          from {
            filter: blur(4px);
          }
          to {
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

      <div
        className={cn(
          'flex items-center gap-2 border-b px-3.5 py-2.5',
          isPremium ? 'border-white/10 bg-white/[0.03]' : 'border-subtle'
        )}
      >
        <div className='flex gap-[5px]'>
          {[1, 2, 3].map(dot => (
            <span
              key={dot}
              className={cn(
                'h-2 w-2 rounded-full',
                isPremium ? 'bg-white/20' : 'bg-[#2a2a2a]'
              )}
            />
          ))}
        </div>
        <div
          className={cn(
            'flex-1 text-center text-xs',
            isPremium ? 'text-white/58' : 'text-tertiary-token'
          )}
        >
          Jovie AI
        </div>
        <button
          type='button'
          onClick={prefersReducedMotion ? showNextDemo : togglePause}
          aria-label={toggleLabel}
          className={cn(
            'focus-ring flex h-6 w-6 items-center justify-center rounded transition-colors',
            isPremium
              ? 'text-white/42 hover:text-white/74'
              : 'text-tertiary-token hover:text-secondary-token'
          )}
        >
          {prefersReducedMotion || isPaused ? (
            <svg
              viewBox='0 0 16 16'
              fill='currentColor'
              className='h-3 w-3'
              aria-hidden='true'
            >
              <path d='M4 2l10 6-10 6V2z' />
            </svg>
          ) : (
            <svg
              viewBox='0 0 16 16'
              fill='currentColor'
              className='h-3 w-3'
              aria-hidden='true'
            >
              <rect x='2' y='2' width='4' height='12' />
              <rect x='10' y='2' width='4' height='12' />
            </svg>
          )}
        </button>
      </div>

      {isPremium && contextChips.length > 0 ? (
        <div className='flex flex-wrap gap-2 border-b border-white/8 px-4 py-3'>
          {contextChips.map(chip => (
            <span
              key={chip}
              className='rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[10px] tracking-[0.02em] text-white/62'
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}

      <div
        className={cn(
          'border-b px-4 py-3',
          isPremium ? 'border-white/8' : 'border-subtle'
        )}
      >
        <p
          className={cn(
            'font-mono text-[12px]',
            isPremium ? 'text-white/58' : 'text-tertiary-token'
          )}
        >
          {currentDemo.prompt}
        </p>
      </div>

      <div
        className={cn(
          'min-h-[160px] px-4 py-4',
          isPremium &&
            'bg-[radial-gradient(circle_at_top,rgba(129,140,248,0.08),transparent_44%)]'
        )}
      >
        <output
          aria-live='polite'
          className={cn(
            'block text-[13px] leading-[1.75]',
            isPremium ? 'text-white/90' : 'text-primary-token'
          )}
        >
          {currentDemo.segments.map((segment, index) => {
            if (index >= visibleCount) return null;
            return (
              <span
                key={`${demoIndex}-${segment.text.slice(0, 20)}`}
                className='ai-demo-segment'
                style={{
                  animation: prefersReducedMotion
                    ? 'none'
                    : 'segmentIn 0.3s ease forwards',
                  ...(segment.highlight
                    ? {
                        color: isPremium
                          ? 'rgb(196 181 253)'
                          : 'rgb(255 255 255)',
                        fontWeight: 500,
                      }
                    : {}),
                }}
              >
                {segment.text}
              </span>
            );
          })}

          {hasStarted && !prefersReducedMotion ? (
            <span
              className='ai-demo-cursor ml-0.5 inline-block h-[15px] w-[7px] align-text-bottom'
              style={{
                backgroundColor: isPremium
                  ? 'rgb(196 181 253)'
                  : 'rgb(167 139 250)',
                animation: 'cursorBlink 1s step-end infinite',
              }}
              aria-hidden='true'
            />
          ) : null}
        </output>
      </div>
    </figure>
  );
}
