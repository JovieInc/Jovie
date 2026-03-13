'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { cn } from '@/lib/utils';
import { MoonIcon, SunIcon } from './ThemeIcons';
import {
  type DashboardThemeToggleProps,
  THEME_OPTIONS,
  type ThemeValue,
} from './types';
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
        <div className='h-4 w-24 rounded bg-(--linear-bg-surface-0)' />
        <div className='h-8 rounded bg-(--linear-bg-surface-0)' />
      </div>
    </div>
  );
}

function LoadingStateToggle() {
  return (
    <div className='flex items-center space-x-3'>
      <span className='text-[13px] text-(--linear-text-secondary)'>Light</span>
      <div className='relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) p-0.5 transition-colors duration-200 ease-out'>
        <span className='inline-block h-5 w-5 translate-x-0 transform rounded-full bg-(--linear-bg-surface-1) shadow ring-0 transition duration-200 ease-out' />
      </div>
      <span className='text-[13px] text-(--linear-text-secondary)'>Dark</span>
    </div>
  );
}

function getThemeIcon(value: string) {
  if (value === 'light')
    return <SunIcon className='h-5 w-5 text-(--linear-text-secondary)' />;
  if (value === 'dark')
    return <MoonIcon className='h-5 w-5 text-(--linear-text-secondary)' />;
  return <SystemIcon className='h-5 w-5 text-(--linear-text-secondary)' />;
}

interface ThemeOptionGridProps {
  readonly theme: string | undefined;
  readonly resolvedTheme: string | undefined;
  readonly isUpdating: boolean;
  readonly onThemeChange: (value: ThemeValue) => void;
}

function ThemeOptionGrid({
  theme,
  resolvedTheme,
  isUpdating,
  onThemeChange,
}: ThemeOptionGridProps) {
  const showResolvedTheme = (optionValue: string) =>
    theme === optionValue && optionValue === 'system';

  return (
    <div className='space-y-3'>
      <span className='text-[13px] font-[510] text-(--linear-text-primary)'>
        Theme Preference
      </span>
      <div className='grid grid-cols-3 gap-2'>
        {THEME_OPTIONS.map(option => (
          <button
            type='button'
            key={option.value}
            onClick={() => onThemeChange(option.value)}
            disabled={isUpdating}
            className={cn(
              'flex flex-col items-center justify-center rounded-lg border px-3 py-3 transition-all duration-200',
              theme === option.value
                ? 'border-(--linear-border-focus) bg-(--linear-bg-surface-0) text-(--linear-text-primary)'
                : 'border-(--linear-border-subtle) bg-(--linear-bg-surface-1) text-(--linear-text-secondary) hover:bg-(--linear-bg-surface-0)',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <span className='mb-1 flex items-center justify-center'>
              {getThemeIcon(option.value)}
            </span>
            <span className='text-[11px] font-[510]'>{option.label}</span>
            {showResolvedTheme(option.value) && (
              <span className='mt-1 text-[11px] text-(--linear-text-secondary)'>
                ({resolvedTheme})
              </span>
            )}
          </button>
        ))}
      </div>
      <p className='text-[11px] text-(--linear-text-secondary)'>
        Choose how the interface appears. System follows your device settings.
      </p>
    </div>
  );
}

interface ThemeToggleButtonProps {
  readonly isDark: boolean;
  readonly isUpdating: boolean;
  readonly onToggle: () => void;
  readonly variant: 'compact' | 'default';
}

function ThemeToggleButton({
  isDark,
  isUpdating,
  onToggle,
  variant,
}: ThemeToggleButtonProps) {
  const ThemeIcon = isDark ? MoonIcon : SunIcon;
  const tooltipText = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  if (variant === 'compact') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <AppIconButton
            ariaLabel={tooltipText}
            disabled={isUpdating}
            onClick={onToggle}
            className={cn(
              'h-8 w-8 rounded-[8px] bg-(--linear-bg-surface-1) text-(--linear-text-quaternary) hover:bg-(--linear-bg-surface-2) hover:text-(--linear-text-secondary) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)/25 [&_svg]:h-4 [&_svg]:w-4',
              isUpdating && 'opacity-70'
            )}
          >
            <ThemeIcon className='h-4 w-4 text-(--linear-text-secondary)' />
          </AppIconButton>
        </TooltipTrigger>
        <TooltipContent side='right'>{tooltipText}</TooltipContent>
      </Tooltip>
    );
  }

  const targetMode = isDark ? 'light' : 'dark';
  const srText = isUpdating
    ? 'Updating theme...'
    : `Switch to ${targetMode} mode`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          disabled={isUpdating}
          onClick={onToggle}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-(--linear-border-subtle) transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus) disabled:cursor-not-allowed disabled:opacity-50',
            isDark
              ? 'bg-(--linear-border-focus)'
              : 'bg-(--linear-bg-surface-0)',
            'p-0.5'
          )}
          role='switch'
          aria-checked={isDark}
        >
          <span className='sr-only'>{srText}</span>
          <span
            aria-hidden='true'
            className={cn(
              'flex h-5 w-5 transform items-center justify-center rounded-full bg-(--linear-bg-surface-1) shadow ring-0 transition duration-200 ease-out',
              isDark ? 'translate-x-5' : 'translate-x-0',
              isUpdating && 'animate-pulse motion-reduce:animate-none'
            )}
          >
            <ThemeIcon className='h-3 w-3 text-(--linear-text-primary)' />
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side='right'>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}

export function DashboardThemeToggle({
  onThemeChange,
  onThemeSave,
  showSystemOption = false,
  variant = 'default',
}: Readonly<DashboardThemeToggleProps>) {
  const {
    mounted,
    isUpdating,
    theme,
    resolvedTheme,
    isDark,
    handleThemeChange,
  } = useDashboardTheme({ onThemeChange, onThemeSave });

  if (!mounted) {
    return showSystemOption ? (
      <LoadingStateWithSystem />
    ) : (
      <LoadingStateToggle />
    );
  }

  if (showSystemOption) {
    return (
      <ThemeOptionGrid
        theme={theme}
        resolvedTheme={resolvedTheme}
        isUpdating={isUpdating}
        onThemeChange={handleThemeChange}
      />
    );
  }

  return (
    <ThemeToggleButton
      isDark={isDark}
      isUpdating={isUpdating}
      onToggle={() => handleThemeChange(isDark ? 'light' : 'dark')}
      variant={variant}
    />
  );
}
