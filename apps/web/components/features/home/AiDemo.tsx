'use client';

import { Pause, Play } from 'lucide-react';
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

function resolveToggleLabel(
  prefersReducedMotion: boolean,
  isPaused: boolean
): string {
  if (prefersReducedMotion) return 'Show next demo';
  if (isPaused) return 'Resume demo';
  return 'Pause demo';
}

function AiDemoCursor() {
  return (
    <span
      className='ai-demo-cursor ml-0.5 inline-block h-4 w-2 bg-current align-text-bottom text-primary-token'
      aria-hidden='true'
    />
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

  const toggleLabel = resolveToggleLabel(prefersReducedMotion, isPaused);

  return (
    <figure
      ref={containerRef}
      aria-label='AI writing demo'
      className={cn(
        'overflow-hidden font-sans',
        isPremium
          ? 'rounded-[1.35rem] border border-subtle bg-surface-1 shadow-panel-ring'
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
        .ai-demo-segment {
          animation: segmentIn 0.3s ease forwards;
        }
        .ai-demo-cursor {
          animation: cursorBlink 1s step-end infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .ai-demo-segment { animation: none !important; }
          .ai-demo-cursor { animation: none !important; }
        }
      `}</style>

      <div
        className={cn(
          'flex items-center gap-2 border-b border-subtle px-3.5 py-2.5',
          isPremium && 'bg-surface-0'
        )}
      >
        <div className='flex gap-1'>
          {[1, 2, 3].map(dot => (
            <span key={dot} className='h-2 w-2 rounded-full bg-surface-3' />
          ))}
        </div>
        <div className='flex-1 text-center text-xs text-tertiary-token'>
          Jovie AI
        </div>
        <button
          type='button'
          onClick={prefersReducedMotion ? showNextDemo : togglePause}
          aria-label={toggleLabel}
          className={cn(
            'focus-ring flex h-6 w-6 items-center justify-center rounded transition-colors',
            isPremium
              ? 'text-tertiary-token hover:text-primary-token'
              : 'text-tertiary-token hover:text-secondary-token'
          )}
        >
          {prefersReducedMotion || isPaused ? (
            <Play className='h-3 w-3' aria-hidden='true' />
          ) : (
            <Pause className='h-3 w-3' aria-hidden='true' />
          )}
        </button>
      </div>

      {isPremium && contextChips.length > 0 ? (
        <div className='flex flex-wrap gap-2 border-b border-subtle px-4 py-3'>
          {contextChips.map(chip => (
            <span
              key={chip}
              className='rounded-full border border-subtle bg-surface-0 px-2.5 py-1 text-3xs text-tertiary-token'
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}

      <div className='border-b border-subtle px-4 py-3'>
        <p className='font-mono text-xs text-tertiary-token'>
          {currentDemo.prompt}
        </p>
      </div>

      <div
        className={cn('min-h-40 px-4 py-4', isPremium && 'bg-surface-0')}
      >
        <output
          aria-live='polite'
          className='block text-app leading-[1.75] text-secondary-token'
        >
          {currentDemo.segments.map((segment, index) => {
            if (index >= visibleCount) return null;
            return (
              <span
                key={`${demoIndex}-${segment.text.slice(0, 20)}`}
                className={cn(
                  'ai-demo-segment',
                  segment.highlight && 'font-medium text-primary-token'
                )}
              >
                {segment.text}
              </span>
            );
          })}

          {hasStarted && !prefersReducedMotion ? <AiDemoCursor /> : null}
        </output>
      </div>
    </figure>
  );
}
