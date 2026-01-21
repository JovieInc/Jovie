'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { cn } from '@/lib/utils';
import { MoonIcon, SunIcon } from './ThemeIcons';
import type {
  DashboardThemeToggleProps,
  UseDashboardThemeReturn,
} from './types';
import { THEME_OPTIONS } from './types';
import { useDashboardTheme } from './useDashboardTheme';

function SystemIcon({ className }: Readonly<{ className: string }>) {
  return (
    <svg
      aria-hidden='true'
      viewBox='0 0 24 24'
      className={className}
      fill='none'
      stroke='currentColor'
      strokeWidth={1.5}
      strokeLinecap='round'
      strokeLinejoin='round'
    >
      <path d='M3.75 5.75A2 2 0 0 1 5.75 3.75h12.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H5.75a2 2 0 0 1-2-2v-8.5Z' />
      <path d='M8.5 20.25h7' />
      <path d='M12 16.25v4' />
    </svg>
  );
}

function LoadingStateWithSystem() {
  return (
    <div className='space-y-3'>
      <div className='animate-pulse motion-reduce:animate-none space-y-3'>
        <div className='h-4 bg-surface-hover-token rounded w-24' />
        <div className='h-8 bg-surface-hover-token rounded' />
      </div>
    </div>
  );
}

function LoadingStateToggle() {
  return (
    <div className='flex items-center space-x-3'>
      <span className='text-sm text-secondary-token'>Light</span>
      <div className='relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed rounded-full border border-border bg-surface-hover-token p-0.5 transition-colors duration-200 ease-out'>
        <span className='translate-x-0 inline-block h-5 w-5 transform rounded-full bg-surface-0 shadow ring-0 transition duration-200 ease-out' />
      </div>
      <span className='text-sm text-secondary-token'>Dark</span>
    </div>
  );
}

function getThemeIcon(value: string) {
  if (value === 'light')
    return <SunIcon className='h-5 w-5 text-secondary-token' />;
  if (value === 'dark')
    return <MoonIcon className='h-5 w-5 text-secondary-token' />;
  return <SystemIcon className='h-5 w-5 text-secondary-token' />;
}

type ThemeState = UseDashboardThemeReturn;

function SystemOptionVariant({
  theme,
  resolvedTheme,
  isUpdating,
  handleThemeChange,
}: ThemeState) {
  return (
    <div className='space-y-3'>
      <span className='text-sm font-medium text-primary-token'>
        Theme Preference
      </span>
      <div className='grid grid-cols-3 gap-2'>
        {THEME_OPTIONS.map(option => {
          const isSelected = theme === option.value;
          const showResolved = isSelected && option.value === 'system';
          return (
            <button
              type='button'
              key={option.value}
              onClick={() => handleThemeChange(option.value)}
              disabled={isUpdating}
              className={cn(
                'flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all duration-200',
                isSelected
                  ? 'border-accent bg-accent/10 text-primary-token'
                  : 'border-border hover:bg-surface-hover-token text-secondary-token',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <span className='mb-1 flex items-center justify-center'>
                {getThemeIcon(option.value)}
              </span>
              <span className='text-xs font-medium'>{option.label}</span>
              {showResolved && (
                <span className='text-xs text-secondary-token mt-1'>
                  ({resolvedTheme})
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className='text-xs text-secondary-token'>
        Choose how the interface appears. System follows your device settings.
      </p>
    </div>
  );
}

function CompactVariant({ isDark, isUpdating, handleThemeChange }: ThemeState) {
  const Icon = isDark ? MoonIcon : SunIcon;
  const tooltip = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          disabled={isUpdating}
          onClick={() => handleThemeChange(isDark ? 'light' : 'dark')}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md border border-subtle bg-surface-1 text-secondary-token hover:bg-surface-2 hover:text-primary-token transition-colors duration-150',
            isUpdating && 'opacity-70'
          )}
        >
          <Icon className='h-4 w-4 text-secondary-token' />
        </button>
      </TooltipTrigger>
      <TooltipContent side='right'>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function SwitchVariant({ isDark, isUpdating, handleThemeChange }: ThemeState) {
  const Icon = isDark ? MoonIcon : SunIcon;
  const tooltip = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  const srText = isUpdating ? 'Updating theme...' : tooltip;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          disabled={isUpdating}
          onClick={() => handleThemeChange(isDark ? 'light' : 'dark')}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-border transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed',
            isDark ? 'bg-accent' : 'bg-surface-hover-token',
            'p-0.5'
          )}
          role='switch'
          aria-checked={isDark}
        >
          <span className='sr-only'>{srText}</span>
          <span
            aria-hidden='true'
            className={cn(
              'flex h-5 w-5 transform rounded-full bg-surface-0 shadow ring-0 transition duration-200 ease-out items-center justify-center',
              isDark ? 'translate-x-5' : 'translate-x-0',
              isUpdating && 'animate-pulse motion-reduce:animate-none'
            )}
          >
            <Icon className='h-3 w-3 text-accent-token' />
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side='right'>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function DashboardThemeToggle({
  onThemeChange,
  onThemeSave,
  showSystemOption = false,
  variant = 'default',
}: Readonly<DashboardThemeToggleProps>) {
  const themeState = useDashboardTheme({ onThemeChange, onThemeSave });

  if (!themeState.mounted) {
    return showSystemOption ? (
      <LoadingStateWithSystem />
    ) : (
      <LoadingStateToggle />
    );
  }

  if (showSystemOption) {
    return <SystemOptionVariant {...themeState} />;
  }

  if (variant === 'compact') {
    return <CompactVariant {...themeState} />;
  }

  return <SwitchVariant {...themeState} />;
}
