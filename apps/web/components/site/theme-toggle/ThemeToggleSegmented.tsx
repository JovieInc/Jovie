'use client';

/**
 * ThemeToggleSegmented Component
 *
 * Segmented control for theme selection (system/light/dark)
 */

import React from 'react';
import { SmallMoonIcon, SmallSunIcon, SmallSystemIcon } from './ThemeIcons';

interface ThemeToggleSegmentedProps
  extends Readonly<{
    currentTheme: string;
    indicatorX: number;
    setTheme: (theme: 'light' | 'dark' | 'system') => void;
    shortcutDescriptionId?: string;
    shortcutDescription?: string;
    className?: string;
    wrapButton: (button: React.ReactElement) => React.ReactElement;
  }> {}

const baseButtonClass =
  'relative z-10 inline-flex h-7 w-7 flex-none items-center justify-center rounded-full leading-none outline-none transition-colors focus-ring-themed focus-visible:ring-offset-transparent';

function getButtonClass(isActive: boolean): string {
  return `${baseButtonClass} ${isActive ? 'text-primary-token' : 'text-secondary-token hover:text-primary-token'}`;
}

export function ThemeToggleSegmented({
  currentTheme,
  indicatorX,
  setTheme,
  shortcutDescriptionId,
  shortcutDescription,
  className = '',
  wrapButton,
}: ThemeToggleSegmentedProps) {
  return (
    <>
      <div
        role='toolbar'
        aria-label='Theme'
        className={`relative inline-flex items-center gap-0 rounded-full border border-subtle bg-surface-2 p-0 ${className}`}
      >
        <div
          aria-hidden='true'
          className='pointer-events-none absolute top-0 bottom-0 left-0 w-7 rounded-full bg-surface-0 ring-1 ring-inset ring-(--color-border-subtle) transition-transform duration-150 ease-[cubic-bezier(.25,1,.5,1)]'
          style={{ transform: `translateX(${indicatorX}px)` }}
        />

        <button
          type='button'
          aria-label='System theme'
          className={getButtonClass(currentTheme === 'system')}
          onClick={() => setTheme('system')}
        >
          <span className='absolute inset-[calc(-3/16*1rem)]' />
          <SmallSystemIcon />
        </button>

        {wrapButton(
          <button
            type='button'
            aria-label='Light theme'
            aria-describedby={
              shortcutDescription ? shortcutDescriptionId : undefined
            }
            className={getButtonClass(currentTheme === 'light')}
            onClick={() => setTheme('light')}
          >
            <span className='absolute inset-[calc(-3/16*1rem)]' />
            <SmallSunIcon />
          </button>
        )}

        {wrapButton(
          <button
            type='button'
            aria-label='Dark theme'
            aria-describedby={
              shortcutDescription ? shortcutDescriptionId : undefined
            }
            className={getButtonClass(currentTheme === 'dark')}
            onClick={() => setTheme('dark')}
          >
            <span className='absolute inset-[calc(-3/16*1rem)]' />
            <SmallMoonIcon />
          </button>
        )}
      </div>
      {shortcutDescription ? (
        <span id={shortcutDescriptionId} className='sr-only'>
          {shortcutDescription}
        </span>
      ) : null}
    </>
  );
}
