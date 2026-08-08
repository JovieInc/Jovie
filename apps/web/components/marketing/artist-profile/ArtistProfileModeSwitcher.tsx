'use client';

import { Tabs } from '@jovie/ui';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useState } from 'react';
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
  const reducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const activeMode = adaptive.modes[activeIndex] ?? adaptive.modes[0];
  const headlineLines = adaptive.headline.split('\n');
  const compactAccessibleContext = [phoneCaption, phoneSubcaption]
    .filter(Boolean)
    .join(' ');

  const selectMode = (modeId: string) => {
    const nextIndex = adaptive.modes.findIndex(mode => mode.id === modeId);
    if (nextIndex >= 0) {
      setActiveIndex(nextIndex);
    }
  };

  if (!activeMode) {
    return null;
  }

  return (
    <div
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
            {/* ui-casing-allow: marketing display headline */}
            <h2 className={cn(SHELL_H2_CLASS, 'ap-mode-switcher__headline')}>
              {headlineLines.map((line, index) => (
                <span key={line} className='block'>
                  {line}
                  {index < headlineLines.length - 1 ? <br /> : null}
                </span>
              ))}
            </h2>
            {adaptive.body ? (
              <p className={cn(SHELL_LEAD_CLASS, 'mt-6 max-w-xl')}>
                {adaptive.body}
              </p>
            ) : null}
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
                    'relative flex min-w-0 items-center justify-center whitespace-nowrap px-2 text-center text-2xs font-semibold leading-none text-tertiary-token transition-colors duration-subtle hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=active]:text-primary-token sm:text-xs',
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
              showIntroHeading ? 'mt-6 min-h-20' : 'mt-2.5 min-h-10 px-2'
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
                    <p className='mt-2 font-mono text-xs tracking-tight text-tertiary-token'>
                      {mode.pathLabel}
                    </p>
                  ) : null}
                </motion.div>
              </Tabs.Content>
            ))}
          </div>
        </Tabs.Root>
      </div>

      <div
        className={cn(
          'relative mx-auto w-full',
          showIntroHeading
            ? 'max-w-sm lg:max-w-md'
            : 'ap-mode-switcher__phone--compact order-1 mb-4'
        )}
      >
        <div
          className={cn(
            'relative mx-auto w-full',
            showIntroHeading ? 'max-w-xs' : 'max-w-none'
          )}
        >
          <ArtistProfilePhoneFrame className='relative z-10 max-w-none'>
            <div className='relative h-full w-full'>
              {showIntroHeading ? (
                <div
                  aria-hidden='true'
                  className='absolute inset-x-0 top-0 z-10 h-10 bg-surface-0'
                />
              ) : null}
              <AnimatePresence initial={false} mode='sync'>
                <motion.div
                  key={activeMode.id}
                  className={cn(
                    'absolute inset-0',
                    showIntroHeading ? 'top-10' : null
                  )}
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
