'use client';

import { clsx } from 'clsx';
import { useTheme } from 'next-themes';
import React, { useEffect, useState } from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  variant?: 'auto' | 'light' | 'dark';
}

export function LoadingSpinner({
  size = 'md',
  className,
  variant = 'auto',
}: LoadingSpinnerProps) {
  const { theme, systemTheme } = useTheme();
  const [isVisible, setIsVisible] = useState(false);

  // Debounce visibility to avoid flicker
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 200); // 200ms debounce as specified (150-250ms range)

    return () => clearTimeout(timer);
  }, []);

  // Determine the effective theme for coloring
  const getEffectiveTheme = () => {
    if (variant === 'light') return 'light';
    if (variant === 'dark') return 'dark';

    // For 'auto', use the current theme
    const currentTheme = theme === 'system' ? systemTheme : theme;
    return currentTheme === 'dark' ? 'dark' : 'light';
  };

  const effectiveTheme = getEffectiveTheme();

  // Size classes for the spinner container
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  // Stroke width based on size
  const strokeWidth = {
    sm: 2,
    md: 2.5,
    lg: 3,
  };

  // Colors based on theme
  const getColors = () => {
    if (effectiveTheme === 'light') {
      return {
        primary: 'text-gray-900',
        secondary: 'text-gray-200',
      };
    } else {
      return {
        primary: 'text-white',
        secondary: 'text-gray-700',
      };
    }
  };

  const colors = getColors();

  if (!isVisible) {
    return (
      <div
        className={clsx(sizeClasses[size], className)}
        role='status'
        aria-label='Loading'
        data-testid='spinner'
        data-size={size}
        data-variant={variant}
        data-theme={effectiveTheme}
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
      data-testid='spinner'
      data-size={size}
      data-variant={variant}
      data-theme={effectiveTheme}
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
