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
    readonly size?: 'default' | 'footer';
    readonly variant?: 'default' | 'linear';
    readonly wrapButton: (button: React.ReactElement) => React.ReactElement;
  }> {}

const baseButtonClass =
  'relative z-10 inline-flex flex-none items-center justify-center rounded-full leading-none outline-none transition-colors focus-ring-themed focus-visible:ring-offset-transparent';

function getButtonClass(
  isActive: boolean,
  isLinear: boolean,
  size: 'default' | 'footer'
): string {
  const buttonSize = size === 'footer' ? 'h-7 w-11 px-3' : 'h-7 w-7';
  if (isLinear) {
    return `${baseButtonClass} ${buttonSize} ${isActive ? '' : 'hover:opacity-80'}`;
  }
  return `${baseButtonClass} ${buttonSize} ${isActive ? 'text-primary-token' : 'text-secondary-token hover:text-primary-token'}`;
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
  size = 'default',
  variant = 'default',
  wrapButton,
}: ThemeToggleSegmentedProps) {
  const isLinear = variant === 'linear';
  // The footer rail is 44px per segment, while the selected visible pill stays
  // 28px and is centered inside that hit target.
  const indicatorClass = 'w-7';
  const indicatorInsetClass =
    size === 'footer' ? 'top-2 bottom-2 left-2' : 'top-0 bottom-0 left-0';
  const hitTargetClass =
    size === 'footer'
      ? '-inset-y-2 left-0 right-0'
      : 'inset-[calc(-3/16*1rem)]';
  const containerClass = size === 'footer' ? 'h-11 px-0 py-2' : 'p-0';

  return (
    <>
      <div
        role='toolbar'
        aria-label='Theme'
        className={`relative inline-flex items-center gap-0 rounded-full ${containerClass} ${isLinear ? '' : 'border border-subtle bg-surface-2'} ${className}`}
        style={isLinear ? LINEAR_STYLES.container : undefined}
      >
        <div
          aria-hidden='true'
          className={`pointer-events-none absolute ${indicatorInsetClass} ${indicatorClass} rounded-full transition-transform duration-subtle ease-subtle ${isLinear ? '' : 'bg-surface-0 ring-1 ring-inset ring-(--color-border-subtle)'}`}
          style={{
            transform: `translateX(${indicatorX}px)`,
            ...(isLinear ? LINEAR_STYLES.indicator : {}),
          }}
        />

        <button
          type='button'
          aria-label='System Theme'
          aria-pressed={currentTheme === 'system'}
          className={getButtonClass(currentTheme === 'system', isLinear, size)}
          style={
            isLinear
              ? getLinearButtonStyle(currentTheme === 'system')
              : undefined
          }
          onClick={() => setTheme('system')}
        >
          <span aria-hidden='true' className={`absolute ${hitTargetClass}`} />
          <SmallSystemIcon />
        </button>

        {wrapButton(
          <button
            type='button'
            aria-label='Light Theme'
            aria-pressed={currentTheme === 'light'}
            aria-describedby={
              shortcutDescription ? shortcutDescriptionId : undefined
            }
            className={getButtonClass(currentTheme === 'light', isLinear, size)}
            style={
              isLinear
                ? getLinearButtonStyle(currentTheme === 'light')
                : undefined
            }
            onClick={() => setTheme('light')}
          >
            <span aria-hidden='true' className={`absolute ${hitTargetClass}`} />
            <SmallSunIcon />
          </button>
        )}

        {wrapButton(
          <button
            type='button'
            aria-label='Dark Theme'
            aria-pressed={currentTheme === 'dark'}
            aria-describedby={
              shortcutDescription ? shortcutDescriptionId : undefined
            }
            className={getButtonClass(currentTheme === 'dark', isLinear, size)}
            style={
              isLinear
                ? getLinearButtonStyle(currentTheme === 'dark')
                : undefined
            }
            onClick={() => setTheme('dark')}
          >
            <span aria-hidden='true' className={`absolute ${hitTargetClass}`} />
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
