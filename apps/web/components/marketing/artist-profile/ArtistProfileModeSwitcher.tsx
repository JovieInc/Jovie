'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

interface ArtistProfileModeSwitcherProps {
  readonly adaptive: ArtistProfileLandingCopy['adaptive'];
  readonly phoneCaption: string;
  readonly phoneSubcaption: string;
}

const DEEP_LINK_PROOF = ['/listen', '/pay', '/tour', '/contact'] as const;

const INTRO_REVEAL_PROGRESS = 0.16;
const MODE_CONTROLS_PROGRESS = 0.52;

function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function ArtistProfileModeSwitcher({
  adaptive,
  phoneCaption,
  phoneSubcaption,
}: Readonly<ArtistProfileModeSwitcherProps>) {
  const sequenceRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const activeMode = adaptive.modes[activeIndex] ?? adaptive.modes[0];
  const introVisible = reducedMotion || progress >= INTRO_REVEAL_PROGRESS;
  const tabsVisible = reducedMotion || progress >= MODE_CONTROLS_PROGRESS;
  const cueIndex = Math.min(
    adaptive.contextCues.length - 1,
    Math.floor(
      (progress / MODE_CONTROLS_PROGRESS) * adaptive.contextCues.length
    )
  );

  const updateProgress = useCallback(() => {
    const section = sequenceRef.current;
    if (!section) return;

    const rect = section.getBoundingClientRect();
    const scrollable = rect.height - globalThis.innerHeight;
    const nextProgress =
      scrollable <= 0 ? 1 : clampProgress(-rect.top / scrollable);
    setProgress(nextProgress);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setProgress(1);
      return;
    }

    let frame = 0;
    const requestUpdate = () => {
      globalThis.cancelAnimationFrame(frame);
      frame = globalThis.requestAnimationFrame(updateProgress);
    };

    requestUpdate();
    globalThis.addEventListener('scroll', requestUpdate, { passive: true });
    globalThis.addEventListener('resize', requestUpdate);

    return () => {
      globalThis.removeEventListener('scroll', requestUpdate);
      globalThis.removeEventListener('resize', requestUpdate);
      globalThis.cancelAnimationFrame(frame);
    };
  }, [reducedMotion, updateProgress]);

  return (
    <div
      ref={sequenceRef}
      className={cn(
        'relative',
        reducedMotion ? 'py-10 sm:py-12 lg:py-14' : 'min-h-[138svh]'
      )}
    >
      <div
        className={cn(
          'flex justify-center px-5 sm:px-6',
          reducedMotion
            ? 'min-h-0 items-start'
            : 'sticky top-0 min-h-[78svh] items-start pt-5 sm:pt-7'
        )}
      >
        <div className='mx-auto w-full max-w-[31rem] text-center'>
          <div
            className={cn(
              'mx-auto max-w-[34rem] overflow-hidden transition-[max-height,margin,opacity,transform] duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]',
              introVisible
                ? 'mb-5 max-h-60 translate-y-0 opacity-100 sm:mb-6'
                : 'mb-0 max-h-0 translate-y-5 opacity-0'
            )}
          >
            <h2 className='text-[clamp(3.25rem,7vw,6.75rem)] font-semibold leading-[0.86] tracking-[-0.08em] text-primary-token'>
              {phoneCaption}
            </h2>
            <p className='mt-3 text-[clamp(1.05rem,2vw,1.45rem)] font-medium leading-[1.2] tracking-[-0.04em] text-secondary-token'>
              {phoneSubcaption}
            </p>
            <div className='mx-auto mt-3 flex max-w-[31rem] flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:mt-4 sm:gap-x-5'>
              {adaptive.contextCues.map((cue, index) => {
                const isActive = index === cueIndex && !tabsVisible;
                return (
                  <span
                    key={cue}
                    className={cn(
                      'text-[12px] font-medium tracking-[-0.01em] transition-colors duration-300 sm:text-[13px]',
                      isActive ? 'text-primary-token' : 'text-tertiary-token'
                    )}
                  >
                    {cue}
                  </span>
                );
              })}
            </div>
          </div>

          <div className='relative mx-auto aspect-[660/1368] w-[min(100%,21.25rem,32svh)]'>
            {adaptive.modes.map((mode, index) => {
              const isActive = index === activeIndex;
              return (
                <Image
                  key={mode.id}
                  src={mode.screenshotSrc}
                  alt={isActive ? mode.screenshotAlt : ''}
                  aria-hidden={!isActive}
                  fill
                  sizes='(max-width: 640px) 100vw, 376px'
                  className={cn(
                    'object-contain object-center drop-shadow-[0_28px_82px_rgba(0,0,0,0.48)] transition-opacity duration-300 ease-out',
                    isActive ? 'opacity-100' : 'pointer-events-none opacity-0'
                  )}
                  priority={mode.id === 'listen'}
                />
              );
            })}
          </div>

          <div
            aria-hidden={!tabsVisible}
            className={cn(
              'transition-all duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]',
              tabsVisible
                ? '-translate-y-2 opacity-100 sm:-translate-y-3'
                : 'pointer-events-none translate-y-3 opacity-0'
            )}
          >
            <div className='mx-auto flex w-fit max-w-full flex-nowrap items-center justify-start gap-1 overflow-x-auto rounded-full bg-white/[0.035] p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
              {adaptive.modes.map((mode, index) => {
                const isActive = index === activeIndex;
                return (
                  <button
                    key={mode.id}
                    type='button'
                    aria-pressed={isActive}
                    tabIndex={tabsVisible ? 0 : -1}
                    onClick={() => {
                      setActiveIndex(index);
                    }}
                    className={cn(
                      'min-h-11 shrink-0 rounded-full px-3 py-2 text-[12px] font-medium transition-colors',
                      isActive
                        ? 'bg-white text-black'
                        : 'text-tertiary-token hover:bg-white/[0.06] hover:text-primary-token'
                    )}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>

            <div className='mx-auto mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-mono text-[10px] tracking-[-0.02em] text-tertiary-token sm:gap-x-4 sm:text-[11px]'>
              {DEEP_LINK_PROOF.map(path => (
                <span
                  key={path}
                  className={cn(
                    'transition-colors duration-200',
                    activeMode.pathLabel.endsWith(path) &&
                      'text-secondary-token'
                  )}
                >
                  {path}
                </span>
              ))}
            </div>

            <p className='mx-auto mt-2.5 max-w-[22rem] text-[16px] font-medium leading-[1.35] tracking-[-0.03em] text-primary-token/88'>
              {activeMode.headline}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
