'use client';

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@jovie/ui';
import { useTheme } from 'next-themes';
import type React from 'react';
import { useEffect, useId, useMemo, useState } from 'react';

interface ThemeToggleProps {
  appearance?: 'icon' | 'segmented';
  className?: string;
  shortcutKey?: string;
}

export function ThemeToggle({
  appearance = 'icon',
  className = '',
  shortcutKey,
}: ThemeToggleProps) {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const shortcutDisplay = shortcutKey?.trim().toUpperCase();
  const shortcutDescription = shortcutDisplay
    ? `Press ${shortcutDisplay} to toggle between light and dark themes.`
    : undefined;
  const shortcutDescriptionId = useId();

  const renderTooltipContent = useMemo(
    () =>
      shortcutDisplay
        ? () => (
            <TooltipContent side='top' align='center'>
              <div className='flex items-center gap-2 text-xs font-semibold leading-none'>
                <span>Toggle theme</span>
                <kbd className='rounded-md border border-subtle bg-surface-1 px-1.5 text-[10px] tracking-tight'>
                  {shortcutDisplay}
                </kbd>
              </div>
            </TooltipContent>
          )
        : null,
    [shortcutDisplay]
  );

  // Don't render anything until mounted to prevent hydration mismatch
  if (!mounted) {
    return appearance === 'segmented' ? (
      <div
        role='toolbar'
        aria-label='Theme'
        className={`inline-flex items-center gap-0 rounded-full border border-subtle bg-surface-2 p-0 ${className}`}
      >
        <div className='h-7 w-7 rounded-full bg-surface-1' />
        <div className='h-7 w-7 rounded-full bg-surface-1' />
        <div className='h-7 w-7 rounded-full bg-surface-1' />
      </div>
    ) : (
      <Button variant='ghost' size='sm' className='h-8 w-8 px-0' disabled>
        <span className='sr-only'>Loading theme toggle</span>
        <div className='h-4 w-4 animate-pulse motion-reduce:animate-none rounded-sm bg-surface-2' />
      </Button>
    );
  }

  const withShortcutTooltip = (control: React.ReactElement) =>
    renderTooltipContent ? (
      <Tooltip>
        <TooltipTrigger asChild>{control}</TooltipTrigger>
        {renderTooltipContent()}
      </Tooltip>
    ) : (
      control
    );
  const getThemeIcon = () => {
    if (theme === 'system') {
      // System theme - show a computer/auto icon
      return (
        <svg
          className='h-5 w-5'
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
          />
        </svg>
      );
    } else if (resolvedTheme === 'light') {
      // Light theme - show moon (to switch to dark)
      return (
        <svg
          className='h-5 w-5'
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z'
          />
        </svg>
      );
    } else {
      // Dark theme - show sun (to switch to light)
      return (
        <svg
          className='h-5 w-5'
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z'
          />
        </svg>
      );
    }
  };

  const getNextTheme = () => {
    if (theme === 'light') return 'dark';
    if (theme === 'dark') return 'system';
    return 'light';
  };

  if (appearance === 'segmented') {
    const currentTheme = theme ?? 'system';
    const buttonSizePx = 28;
    const gapPx = 0;

    const themes = [
      { value: 'system' as const, label: 'System' },
      { value: 'light' as const, label: 'Light' },
      { value: 'dark' as const, label: 'Dark' },
    ];

    const activeIndex = Math.max(
      0,
      themes.findIndex(t => t.value === currentTheme)
    );
    const indicatorX = activeIndex * (buttonSizePx + gapPx);

    const baseBtn =
      'relative z-10 inline-flex h-7 w-7 flex-none items-center justify-center rounded-full leading-none outline-none transition-colors focus-ring-themed focus-visible:ring-offset-transparent';

    const segmentedGroup = (
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
          className={`${baseBtn} ${currentTheme === 'system' ? 'text-primary-token' : 'text-secondary-token hover:text-primary-token'}`}
          onClick={() => setTheme('system')}
        >
          <span className='absolute inset-[calc(-3/16*1rem)]' />
          <svg
            viewBox='0 0 20 20'
            fill='none'
            aria-hidden='true'
            className='h-3.5 w-3.5'
          >
            <path
              stroke='currentColor'
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth='1.5'
              d='M10 12.5v2.75m0 0H7.75m2.25 0h2.25m-6.5-3h8.5a1 1 0 0 0 1-1v-5.5a1 1 0 0 0-1-1h-8.5a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1Z'
            />
          </svg>
        </button>

        {withShortcutTooltip(
          <button
            type='button'
            aria-label='Light theme'
            aria-describedby={
              shortcutDescription ? shortcutDescriptionId : undefined
            }
            className={`${baseBtn} ${currentTheme === 'light' ? 'text-primary-token' : 'text-secondary-token hover:text-primary-token'}`}
            onClick={() => setTheme('light')}
          >
            <span className='absolute inset-[calc(-3/16*1rem)]' />
            <svg
              viewBox='0 0 20 20'
              fill='none'
              aria-hidden='true'
              className='h-3.5 w-3.5'
            >
              <circle
                cx='10'
                cy='10'
                r='3.25'
                stroke='currentColor'
                strokeWidth='1.5'
              />
              <g
                stroke='currentColor'
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='1.5'
              >
                <path d='M10 3.75v.5M14.42 5.58l-.354.354M16.25 10h-.5M14.42 14.42l-.354-.354M10 15.75v.5M5.934 14.065l-.354.354M4.25 10h-.5M5.934 5.935 5.58 5.58' />
              </g>
            </svg>
          </button>
        )}

        {withShortcutTooltip(
          <button
            type='button'
            aria-label='Dark theme'
            aria-describedby={
              shortcutDescription ? shortcutDescriptionId : undefined
            }
            className={`${baseBtn} ${currentTheme === 'dark' ? 'text-primary-token' : 'text-secondary-token hover:text-primary-token'}`}
            onClick={() => setTheme('dark')}
          >
            <span className='absolute inset-[calc(-3/16*1rem)]' />
            <svg
              viewBox='0 0 20 20'
              fill='none'
              aria-hidden='true'
              className='h-3.5 w-3.5'
            >
              <path
                stroke='currentColor'
                strokeWidth='1.5'
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z'
              />
            </svg>
          </button>
        )}
      </div>
    );

    const segmentedContent = (
      <>
        {segmentedGroup}
        {shortcutDescription ? (
          <span id={shortcutDescriptionId} className='sr-only'>
            {shortcutDescription}
          </span>
        ) : null}
      </>
    );

    return renderTooltipContent ? (
      <TooltipProvider delayDuration={0}>{segmentedContent}</TooltipProvider>
    ) : (
      segmentedContent
    );
  }

  const toggleButton = (
    <Button
      variant='ghost'
      size='sm'
      onClick={cycleTheme}
      aria-describedby={shortcutDescription ? shortcutDescriptionId : undefined}
      className={`h-8 w-8 p-0 flex items-center justify-center rounded-full shadow-sm ring-1 ring-(--color-border-subtle) bg-surface-0 text-primary-token transition-colors hover:bg-surface-1 focus-ring-themed focus-visible:ring-offset-transparent ${className}`}
      title={`Current: ${theme === 'system' ? `auto (${resolvedTheme})` : theme}. Click to switch to ${getNextTheme()}${shortcutDisplay ? ` (${shortcutDisplay})` : ''}`}
    >
      <span
        className='sr-only'
        id={shortcutDescription ? shortcutDescriptionId : undefined}
      >
        Toggle theme. Current:{' '}
        {theme === 'system' ? `auto (${resolvedTheme})` : theme}. Next:{' '}
        {getNextTheme()}.
      </span>
      {getThemeIcon()}
    </Button>
  );

  const buttonWithTooltip = withShortcutTooltip(toggleButton);

  return shortcutDescription ? (
    <TooltipProvider delayDuration={0}>{buttonWithTooltip}</TooltipProvider>
  ) : (
    buttonWithTooltip
  );
}
