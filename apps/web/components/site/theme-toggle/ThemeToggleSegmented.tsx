'use client';

/**
 * ThemeToggleSegmented Component
 *
 * Segmented control for theme selection (system/light/dark)
 */

import type { CSSProperties } from 'react';
import React from 'react';
import { SmallMoonIcon, SmallSunIcon, SmallSystemIcon } from './ThemeIcons';

interface ThemeToggleSegmentedProps
  extends Readonly<{
    readonly currentTheme: string;
    readonly indicatorX: number;
    readonly setTheme: (theme: 'light' | 'dark' | 'system') => void;
    readonly shortcutDescriptionId?: string;
    readonly shortcutDescription?: string;
    readonly className?: string;
    readonly variant?: 'default' | 'linear';
    readonly wrapButton: (button: React.ReactElement) => React.ReactElement;
  }> {}

const baseButtonClass =
  'relative z-10 inline-flex h-7 w-7 flex-none items-center justify-center rounded-full leading-none outline-none transition-colors focus-ring-themed focus-visible:ring-offset-transparent';

function getButtonClass(isActive: boolean, isLinear: boolean): string {
  if (isLinear) {
    return `${baseButtonClass} ${isActive ? '' : 'hover:opacity-80'}`;
  }
  return `${baseButtonClass} ${isActive ? 'text-primary-token' : 'text-secondary-token hover:text-primary-token'}`;
}

// Linear-specific styles
const LINEAR_STYLES = {
  container: {
    backgroundColor: 'var(--linear-bg-button)',
    border: '1px solid var(--linear-border-subtle)',
  },
  indicator: {
    backgroundColor: 'var(--linear-bg-surface-1)',
    boxShadow: 'inset 0 0 0 1px var(--linear-border-subtle)',
  },
  buttonActive: { color: 'var(--linear-text-primary)' },
  buttonInactive: { color: 'var(--linear-text-tertiary)' },
} as const;

function getLinearButtonStyle(isActive: boolean): CSSProperties {
  return isActive ? LINEAR_STYLES.buttonActive : LINEAR_STYLES.buttonInactive;
}

export function ThemeToggleSegmented({
  currentTheme,
  indicatorX,
  setTheme,
  shortcutDescriptionId,
  shortcutDescription,
  className = '',
  variant = 'default',
  wrapButton,
}: ThemeToggleSegmentedProps) {
  const isLinear = variant === 'linear';

  return (
    <>
      <div
        role='toolbar'
        aria-label='Theme'
        className={`relative inline-flex items-center gap-0 rounded-full p-0 ${isLinear ? '' : 'border border-subtle bg-surface-2'} ${className}`}
        style={isLinear ? LINEAR_STYLES.container : undefined}
      >
        <div
          aria-hidden='true'
          className={`pointer-events-none absolute top-0 bottom-0 left-0 w-7 rounded-full transition-transform duration-150 ease-[cubic-bezier(.25,1,.5,1)] ${isLinear ? '' : 'bg-surface-0 ring-1 ring-inset ring-(--color-border-subtle)'}`}
          style={{
            transform: `translateX(${indicatorX}px)`,
            ...(isLinear ? LINEAR_STYLES.indicator : {}),
          }}
        />

        <button
          type='button'
          aria-label='System theme'
          className={getButtonClass(currentTheme === 'system', isLinear)}
          style={
            isLinear
              ? getLinearButtonStyle(currentTheme === 'system')
              : undefined
          }
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
            className={getButtonClass(currentTheme === 'light', isLinear)}
            style={
              isLinear
                ? getLinearButtonStyle(currentTheme === 'light')
                : undefined
            }
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
            className={getButtonClass(currentTheme === 'dark', isLinear)}
            style={
              isLinear
                ? getLinearButtonStyle(currentTheme === 'dark')
                : undefined
            }
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
