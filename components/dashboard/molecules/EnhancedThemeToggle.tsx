'use client';

import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface EnhancedThemeToggleProps {
  onThemeChange?: (theme: 'light' | 'dark' | 'system') => void;
  showSystemOption?: boolean;
  variant?: 'default' | 'compact';
}

type ThemeValue = 'light' | 'dark' | 'system';

export function EnhancedThemeToggle({
  onThemeChange,
  showSystemOption = false,
  variant = 'default',
}: EnhancedThemeToggleProps) {
  const [mounted, setMounted] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const appliedTheme = useMemo<ThemeValue>(() => {
    if (!mounted) return 'system';
    if (theme === 'system') {
      if (resolvedTheme === 'dark') return 'dark';
      if (resolvedTheme === 'light') return 'light';
      return 'system';
    }
    return (theme as ThemeValue) ?? 'system';
  }, [mounted, resolvedTheme, theme]);

  const savePreference = async (newTheme: ThemeValue) => {
    setIsUpdating(true);
    setTheme(newTheme);

    try {
      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          updates: {
            theme: { preference: newTheme },
          },
        }),
      });

      if (!response.ok) {
        console.error('Failed to save theme preference');
      }

      onThemeChange?.(newTheme);
    } catch (error) {
      console.error('Error saving theme preference:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  if (!mounted) {
    if (showSystemOption) {
      return (
        <div className='space-y-3'>
          <div className='h-4 w-28 rounded-md bg-surface-2 animate-pulse' />
          <div className='grid grid-cols-3 gap-2'>
            {(['light', 'dark', 'system'] as ThemeValue[]).map(option => (
              <div
                key={option}
                className='h-16 rounded-xl border border-subtle bg-surface-1 animate-pulse'
              />
            ))}
          </div>
        </div>
      );
    }

    if (variant === 'compact') {
      return (
        <div className='h-9 w-9 rounded-full bg-surface-2 animate-pulse' />
      );
    }

    return (
      <div className='flex items-center gap-2'>
        <div className='h-9 flex-1 rounded-md border border-subtle bg-surface-1 animate-pulse' />
        <div className='h-9 flex-1 rounded-md border border-subtle bg-surface-1 animate-pulse' />
      </div>
    );
  }

  const options: ThemeValue[] = showSystemOption
    ? ['light', 'dark', 'system']
    : ['light', 'dark'];

  const optionCopy: Record<ThemeValue, string> = {
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  };

  const optionIcons: Record<ThemeValue, JSX.Element> = {
    light: <Sun className='h-4 w-4' aria-hidden='true' />,
    dark: <Moon className='h-4 w-4' aria-hidden='true' />,
    system: <Monitor className='h-4 w-4' aria-hidden='true' />,
  };

  const isDarkMode = appliedTheme === 'dark';

  if (showSystemOption) {
    return (
      <div className='space-y-3'>
        <label className='text-sm font-medium text-primary-token'>
          Theme preference
        </label>
        <div className='grid grid-cols-3 gap-2'>
          {options.map(option => {
            const isActive = theme === option;

            return (
              <Button
                key={option}
                type='button'
                variant='ghost'
                className={cn(
                  'h-auto flex flex-col items-center justify-center gap-1 rounded-xl border px-3 py-3 text-sm transition-all',
                  isActive
                    ? 'border-accent bg-accent/10 text-primary-token shadow-sm'
                    : 'border-transparent bg-surface-1 text-secondary-token hover:bg-surface-2',
                  isUpdating && option === theme && 'opacity-80'
                )}
                onClick={() => savePreference(option)}
                disabled={isUpdating}
                aria-pressed={isActive}
              >
                <span className='flex size-8 items-center justify-center rounded-full bg-surface-2 text-primary-token'>
                  {optionIcons[option]}
                </span>
                <span className='text-xs font-medium'>
                  {optionCopy[option]}
                </span>
                {option === 'system' && theme === 'system' ? (
                  <span className='text-xs text-tertiary-token'>
                    ({resolvedTheme ?? 'auto'})
                  </span>
                ) : null}
              </Button>
            );
          })}
        </div>
        <p className='text-xs text-secondary-token'>
          Choose how the interface appears. System follows your device settings.
        </p>
      </div>
    );
  }

  if (variant === 'compact') {
    const nextTheme: ThemeValue = isDarkMode ? 'light' : 'dark';

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            onClick={() => savePreference(nextTheme)}
            disabled={isUpdating}
            aria-label={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
            className='h-9 w-9 rounded-full text-secondary-token hover:text-primary-token'
          >
            {isDarkMode ? (
              <Moon className='h-4 w-4' aria-hidden='true' />
            ) : (
              <Sun className='h-4 w-4' aria-hidden='true' />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side='right'>
          {isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className='flex items-center gap-2 rounded-lg border border-subtle bg-surface-1 p-1'>
      {options.map(option => {
        const isActive =
          option === appliedTheme ||
          (theme === 'system' && option === appliedTheme);

        return (
          <Button
            key={option}
            type='button'
            variant='ghost'
            size='sm'
            className={cn(
              'flex-1 justify-center rounded-md border text-sm font-medium transition-all',
              isActive
                ? 'border-accent bg-accent/10 text-primary-token shadow-sm'
                : 'border-transparent text-secondary-token hover:bg-surface-2',
              isUpdating && option === appliedTheme && 'opacity-80'
            )}
            onClick={() => savePreference(option)}
            disabled={isUpdating}
            aria-pressed={isActive}
          >
            <span className='flex items-center gap-2'>
              {optionIcons[option]}
              <span>{optionCopy[option]}</span>
            </span>
          </Button>
        );
      })}
    </div>
  );
}
