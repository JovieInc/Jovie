'use client';

import { useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';

interface StudioScriptProps {
  readonly words: readonly string[];
  readonly nextWordIndex: number;
}

/**
 * The script sits in an eye-line band just under the lens so reading looks
 * like eye contact. The line being read is held near the top of the band;
 * said words fade, nothing scrolls the page.
 */
export function StudioScript({ words, nextWordIndex }: StudioScriptProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLSpanElement>(null);
  // Script words repeat, so each word is keyed by its place in the script.
  const tokens = useMemo(
    () => words.map((text, position) => ({ key: `w${position}`, text })),
    [words]
  );

  useEffect(() => {
    const container = containerRef.current;
    const current = currentRef.current;
    if (!container || !current) return;
    const target = current.offsetTop - container.clientHeight * 0.18;
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [nextWordIndex]);

  return (
    <div
      ref={containerRef}
      className='relative h-full overflow-hidden mask-t-from-86% mask-b-from-72%'
      data-testid='teleprompter-studio-script'
    >
      <p className='py-24 text-2xl md:text-3xl xl:text-4xl leading-snug tracking-tight font-semibold text-pretty'>
        {tokens.map((token, index) => {
          const isCurrent = index === nextWordIndex;
          return (
            <span
              key={token.key}
              ref={isCurrent ? currentRef : undefined}
              aria-hidden='true'
              data-word={index}
              className={cn(
                'mr-2 inline-block transition-colors duration-normal ease-out motion-reduce:transition-none',
                index < nextWordIndex && 'text-on-media/35',
                isCurrent &&
                  'text-on-media underline decoration-accent decoration-2 underline-offset-4',
                index > nextWordIndex &&
                  index <= nextWordIndex + 8 &&
                  'text-on-media/95',
                index > nextWordIndex + 8 && 'text-on-media/70'
              )}
            >
              {token.text}
            </span>
          );
        })}
      </p>
      <p className='sr-only' aria-live='polite'>
        {words.slice(nextWordIndex, nextWordIndex + 12).join(' ')}
      </p>
    </div>
  );
}
