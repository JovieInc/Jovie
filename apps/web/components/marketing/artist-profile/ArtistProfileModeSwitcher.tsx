'use client';

import { Tabs } from '@jovie/ui';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import { ArtistProfilePhoneFrame } from './ArtistProfilePhoneFrame';
import { SHELL_H2_CLASS, SHELL_LEAD_CLASS } from './ArtistProfileSectionHeader';
import './ArtistProfileModeSwitcher.css';

interface ArtistProfileModeSwitcherProps {
  readonly adaptive: ArtistProfileLandingCopy['adaptive'];
  readonly phoneCaption?: string;
  readonly phoneSubcaption?: string;
  readonly showIntroHeading?: boolean;
}

export function ArtistProfileModeSwitcher({
  adaptive,
  phoneCaption,
  phoneSubcaption,
  showIntroHeading = true,
}: Readonly<ArtistProfileModeSwitcherProps>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sequenceTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const sequenceStartedRef = useRef(false);
  const manualSelectionRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const activeMode = adaptive.modes[activeIndex] ?? adaptive.modes[0];
  const compactAccessibleContext = [phoneCaption, phoneSubcaption]
    .filter(Boolean)
    .join(' ');

  const clearSequenceTimers = useCallback(() => {
    for (const timer of sequenceTimersRef.current) {
      globalThis.clearTimeout(timer);
    }
    sequenceTimersRef.current = [];
  }, []);

  const stopSequence = useCallback(() => {
    manualSelectionRef.current = true;
    clearSequenceTimers();
  }, [clearSequenceTimers]);

  const selectMode = useCallback(
    (modeId: string, manual = true) => {
      const nextIndex = adaptive.modes.findIndex(mode => mode.id === modeId);
      if (nextIndex < 0) {
        return;
      }

      if (manual) {
        stopSequence();
      }

      setActiveIndex(nextIndex);
    },
    [adaptive.modes, stopSequence]
  );

  const startSequence = useCallback(() => {
    if (manualSelectionRef.current || sequenceStartedRef.current) {
      return;
    }

    const upcomingReleaseIndex = adaptive.modes.findIndex(
      mode => mode.id === 'upcoming-release'
    );
    const touringIndex = adaptive.modes.findIndex(
      mode => mode.id === 'touring'
    );
    const firstIndex = Math.max(upcomingReleaseIndex, 0);

    sequenceStartedRef.current = true;

    if (reducedMotion) {
      return;
    }

    const queueSelection = (index: number, delay: number) => {
      if (index < 0) {
        return;
      }

      const timer = globalThis.setTimeout(() => {
        if (!manualSelectionRef.current) {
          setActiveIndex(index);
        }
      }, delay);
      sequenceTimersRef.current.push(timer);
    };

    queueSelection(firstIndex, 220);
    if (touringIndex >= 0 && touringIndex !== firstIndex) {
      queueSelection(touringIndex, 1320);
    }
  }, [adaptive.modes, reducedMotion]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || globalThis.IntersectionObserver === undefined) {
      startSequence();
      return;
    }

    const observer = new globalThis.IntersectionObserver(
      entries => {
        if (!entries[0]?.isIntersecting) {
          return;
        }
        startSequence();
        observer.disconnect();
      },
      { threshold: 0.35 }
    );

    observer.observe(root);
    return () => observer.disconnect();
  }, [startSequence]);

  useEffect(() => clearSequenceTimers, [clearSequenceTimers]);

  if (!activeMode) {
    return null;
  }

  return (
    <div
      ref={rootRef}
      onFocusCapture={stopSequence}
      onPointerEnter={stopSequence}
      className={cn(
        showIntroHeading
          ? 'grid items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)] lg:gap-16'
          : 'mx-auto flex w-full max-w-lg flex-col items-center text-center'
      )}
    >
      {!showIntroHeading && (phoneCaption || phoneSubcaption) ? (
        <p className='sr-only'>{compactAccessibleContext}</p>
      ) : null}
      <div
        className={cn(
          'max-w-2xl',
          showIntroHeading
            ? null
            : 'ap-mode-switcher__copy--compact order-2 w-full text-center'
        )}
      >
        {showIntroHeading ? (
          <>
            <p className='text-xs font-medium tracking-wide text-secondary-token'>
              {adaptive.eyebrow}
            </p>
            {/* ui-casing-allow: marketing display headline */}
            <h2
              className={cn(SHELL_H2_CLASS, 'ap-mode-switcher__headline mt-5')}
            >
              {adaptive.headline}
            </h2>
            <p className={cn(SHELL_LEAD_CLASS, 'mt-6 max-w-xl')}>
              {adaptive.body}
            </p>
          </>
        ) : null}

        <Tabs.Root
          value={activeMode.id}
          onValueChange={value => selectMode(value)}
          className={cn(showIntroHeading ? 'mt-9 w-full' : 'w-full')}
        >
          <Tabs.List
            aria-label='Profile Modes'
            className={cn(
              'grid border border-subtle bg-surface-0 p-1',
              showIntroHeading
                ? 'grid-cols-2 gap-1 rounded-xl sm:grid-cols-4'
                : 'grid-cols-4 rounded-full'
            )}
          >
            {adaptive.modes.map(mode => {
              const isActive = mode.id === activeMode.id;

              return (
                <Tabs.Trigger
                  key={mode.id}
                  value={mode.id}
                  className={cn(
                    'relative flex min-w-0 items-center justify-center px-2 text-center text-3xs font-semibold leading-tight text-tertiary-token transition-colors duration-subtle hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=active]:text-primary-token sm:text-xs',
                    showIntroHeading
                      ? 'min-h-12 rounded-lg'
                      : 'min-h-11 rounded-full'
                  )}
                >
                  {isActive ? (
                    <motion.span
                      aria-hidden='true'
                      className={cn(
                        'ap-mode-switcher__active-tab absolute inset-0 border border-subtle bg-surface-2',
                        showIntroHeading ? 'rounded-lg' : 'rounded-full'
                      )}
                      layoutId='artist-profile-mode-active-tab'
                      transition={
                        reducedMotion
                          ? { duration: 0 }
                          : {
                              duration: 0.24,
                              ease: [0.22, 1, 0.36, 1],
                            }
                      }
                    />
                  ) : null}
                  <span className='relative'>{mode.label}</span>
                </Tabs.Trigger>
              );
            })}
          </Tabs.List>
          <div
            className={cn(
              showIntroHeading
                ? 'mt-6 min-h-28 border-l border-subtle pl-5'
                : 'mt-2.5 min-h-10 px-2'
            )}
          >
            {adaptive.modes.map(mode => (
              <Tabs.Content
                key={`${mode.id}-panel`}
                value={mode.id}
                className='focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: reducedMotion ? 0 : 0.22 }}
                >
                  {showIntroHeading ? (
                    <p className='text-xs font-semibold text-secondary-token'>
                      {mode.label}
                    </p>
                  ) : null}
                  <p
                    className={cn(
                      'max-w-lg font-semibold leading-snug tracking-tight text-primary-token',
                      showIntroHeading ? 'mt-2 text-xl' : 'text-sm sm:text-mid'
                    )}
                  >
                    {mode.headline}
                  </p>
                  {showIntroHeading ? (
                    <p className='mt-3 font-mono text-xs tracking-tight text-tertiary-token'>
                      {mode.pathLabel}
                    </p>
                  ) : null}
                </motion.div>
              </Tabs.Content>
            ))}
          </div>
        </Tabs.Root>

        {showIntroHeading ? (
          <ul
            className='mt-7 flex flex-wrap gap-x-5 gap-y-2'
            aria-label='Profile Context Signals'
          >
            {adaptive.contextCues.map(cue => (
              <li
                key={cue}
                className='flex items-center gap-2 text-xs font-medium text-tertiary-token'
              >
                <span
                  aria-hidden='true'
                  className='h-1 w-1 rounded-full bg-secondary-token'
                />
                {cue}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div
        className={cn(
          'relative mx-auto w-full',
          showIntroHeading
            ? 'max-w-lg rounded-3xl border border-subtle bg-surface-0 p-6 sm:p-8'
            : 'ap-mode-switcher__phone--compact order-1 mb-4'
        )}
      >
        {showIntroHeading ? (
          <div className='mb-5 flex min-h-13 items-center justify-between gap-4 lg:min-h-0'>
            <div>
              <p className='text-xs font-semibold text-primary-token'>
                {adaptive.productLabel}
              </p>
              <p className='mt-1 text-xs text-tertiary-token'>
                {adaptive.productDetail}
              </p>
            </div>
            <span className='inline-flex min-h-11 items-center rounded-full border border-subtle bg-surface-1 px-3 py-1.5 font-mono text-3xs text-secondary-token lg:min-h-0'>
              {activeMode.label}
            </span>
          </div>
        ) : null}

        <div
          className={cn(
            'relative mx-auto w-full',
            showIntroHeading ? 'max-w-xs' : 'max-w-none'
          )}
        >
          <ArtistProfilePhoneFrame className='relative z-10 max-w-none'>
            <div className='relative h-full w-full'>
              <AnimatePresence initial={false} mode='sync'>
                <motion.div
                  key={activeMode.id}
                  className='absolute inset-0'
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.32 }}
                >
                  <Image
                    src={activeMode.screenshotSrc}
                    alt={activeMode.screenshotAlt}
                    fill
                    sizes={
                      showIntroHeading
                        ? '(max-width: 640px) 78vw, 320px'
                        : '(max-width: 640px) 100vw, 330px'
                    }
                    className='object-cover object-top'
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </ArtistProfilePhoneFrame>
        </div>
      </div>
    </div>
  );
}
