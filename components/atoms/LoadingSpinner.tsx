'use client';

import { clsx } from 'clsx';
import { useTheme } from 'next-themes';
import React, { useEffect, useMemo, useState } from 'react';
import { sizeClasses, strokeWidth } from './LoadingSpinner.constants';

interface LoadingSpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark' | 'auto';
  className?: string;
  showDebounce?: boolean;
}

export function LoadingSpinner({
  size = 'md',
  variant = 'auto',
  className,
  showDebounce = false,
}: LoadingSpinnerProps) {
  const { theme, systemTheme } = useTheme();
  const [isVisible, setIsVisible] = useState(!showDebounce);

  // Debounce visibility to avoid flicker (only if showDebounce is true)
  useEffect(() => {
    if (!showDebounce) return;

    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 200); // 200ms debounce

    return () => clearTimeout(timer);
  }, [showDebounce]);

  const effectiveTheme = useMemo(() => {
    if (variant === 'light') return 'light';
    if (variant === 'dark') return 'dark';
    const currentTheme = theme === 'system' ? systemTheme : theme;
    return currentTheme === 'dark' ? 'dark' : 'light';
  }, [variant, theme, systemTheme]);

  const colors = useMemo(() => {
    if (effectiveTheme === 'light') {
      return {
        primary: 'text-gray-900',
        secondary: 'text-gray-200',
      };
    }
    return {
      primary: 'text-white',
      secondary: 'text-gray-700',
    };
  }, [effectiveTheme]);

  if (!isVisible) {
    return (
      <div
        className={clsx(sizeClasses[size], className)}
        role='status'
        aria-label='Loading'
        aria-live='polite'
      >
        {/* Invisible placeholder to prevent layout shift */}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'inline-flex items-center justify-center',
        sizeClasses[size],
        className
      )}
      role='status'
      aria-label='Loading'
      aria-live='polite'
    >
      <svg
        className={clsx(
          'animate-spin motion-reduce:animate-[spin_1.5s_linear_infinite]',
          'h-full w-full'
        )}
        viewBox='0 0 24 24'
        xmlns='http://www.w3.org/2000/svg'
        fill='none'
      >
        {/* Background circle (lighter color) */}
        <circle
          className={colors.secondary}
          cx='12'
          cy='12'
          r='10'
          stroke='currentColor'
          strokeWidth={strokeWidth[size]}
          strokeLinecap='round'
          strokeDasharray='1, 1'
        />
        {/* Foreground arc (primary color) */}
        <path
          className={colors.primary}
          stroke='currentColor'
          strokeWidth={strokeWidth[size]}
          strokeLinecap='round'
          d='M12 2a10 10 0 0 1 10 10'
        />
      </svg>
    </div>
  );
}
