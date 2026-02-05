'use client';

/**
 * ThemeToggle Component
 *
 * Main theme toggle component supporting both icon and segmented appearances
 */

import {
  Button,
  Kbd,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@jovie/ui';
import React, { useMemo } from 'react';
import { ThemeToggleIcon } from './ThemeToggleIcon';
import { ThemeToggleSegmented } from './ThemeToggleSegmented';
import { ThemeToggleSkeleton } from './ThemeToggleSkeleton';
import type { ThemeToggleProps } from './types';
import { useThemeToggle } from './useThemeToggle';

export function ThemeToggle({
  appearance = 'icon',
  className = '',
  shortcutKey,
  variant = 'default',
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
              <span>Toggle theme</span>
              <Kbd variant='tooltip'>{shortcutDisplay}</Kbd>
            </TooltipContent>
          )
        : null,
    [shortcutDisplay]
  );

  const withShortcutTooltip = (control: React.ReactElement) =>
    renderTooltipContent ? (
      <Tooltip>
        <TooltipTrigger asChild>{control}</TooltipTrigger>
        {renderTooltipContent()}
      </Tooltip>
    ) : (
      control
    );

  // Don't render anything until mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <ThemeToggleSkeleton appearance={appearance} className={className} />
    );
  }

  if (appearance === 'segmented') {
    const segmentedContent = (
      <ThemeToggleSegmented
        currentTheme={currentTheme}
        indicatorX={indicatorX}
        setTheme={setTheme}
        shortcutDescriptionId={shortcutDescriptionId}
        shortcutDescription={shortcutDescription}
        className={className}
        variant={variant}
        wrapButton={withShortcutTooltip}
      />
    );

    return renderTooltipContent ? (
      <TooltipProvider delayDuration={0}>{segmentedContent}</TooltipProvider>
    ) : (
      segmentedContent
    );
  }

  const isLinear = variant === 'linear';
  const iconButtonClass = isLinear
    ? `h-8 w-8 p-0 flex items-center justify-center rounded-full transition-colors hover:opacity-80 focus-ring-themed focus-visible:ring-offset-transparent ${className}`
    : `h-8 w-8 p-0 flex items-center justify-center rounded-full shadow-sm ring-1 ring-(--color-border-subtle) bg-surface-0 text-primary-token transition-colors hover:bg-surface-1 focus-ring-themed focus-visible:ring-offset-transparent ${className}`;

  const iconButtonStyle = isLinear
    ? {
        backgroundColor: 'var(--linear-bg-button)',
        border: '1px solid var(--linear-border-subtle)',
        color: 'var(--linear-text-tertiary)',
      }
    : undefined;

  const toggleButton = (
    <Button
      variant='ghost'
      size='sm'
      onClick={cycleTheme}
      aria-describedby={shortcutDescription ? shortcutDescriptionId : undefined}
      className={iconButtonClass}
      style={iconButtonStyle}
      title={`Current: ${theme === 'system' ? 'auto (' + resolvedTheme + ')' : theme}. Click to switch to ${getNextTheme()}${shortcutDisplay ? ' (' + shortcutDisplay + ')' : ''}`}
    >
      <span
        className='sr-only'
        id={shortcutDescription ? shortcutDescriptionId : undefined}
      >
        Toggle theme. Current:{' '}
        {theme === 'system' ? `auto (${resolvedTheme})` : theme}. Next:{' '}
        {getNextTheme()}.
      </span>
      <ThemeToggleIcon theme={theme} resolvedTheme={resolvedTheme} />
    </Button>
  );

  const buttonWithTooltip = withShortcutTooltip(toggleButton);

  return shortcutDescription ? (
    <TooltipProvider delayDuration={0}>{buttonWithTooltip}</TooltipProvider>
  ) : (
    buttonWithTooltip
  );
}
