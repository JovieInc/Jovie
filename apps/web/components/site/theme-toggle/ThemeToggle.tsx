'use client';

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@jovie/ui';
import React, { useMemo } from 'react';
import {
  MoonIcon,
  SmallMoonIcon,
  SmallSunIcon,
  SmallSystemIcon,
  SunIcon,
  SystemIcon,
} from './ThemeIcons';
import type { ThemeToggleProps } from './types';
import { useThemeToggle } from './useThemeToggle';

export function ThemeToggle({
  appearance = 'icon',
  className = '',
  shortcutKey,
}: ThemeToggleProps) {
  const {
    mounted,
    theme,
    setTheme,
    resolvedTheme,
    cycleTheme,
    getNextTheme,
    shortcutDisplay,
    shortcutDescription,
    shortcutDescriptionId,
    currentTheme,
    indicatorX,
  } = useThemeToggle(shortcutKey);

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
      return <SystemIcon />;
    } else if (resolvedTheme === 'light') {
      return <MoonIcon />;
    } else {
      return <SunIcon />;
    }
  };

  if (appearance === 'segmented') {
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
          <SmallSystemIcon />
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
            <SmallSunIcon />
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
            <SmallMoonIcon />
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
