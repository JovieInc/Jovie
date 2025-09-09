'use client';

import { clsx } from 'clsx';
import React from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

/**
 * PrimaryCTA Component
 *
 * A primary call-to-action button component with enhanced visual effects.
 * Follows standardized button styling guidelines:
 * - Uses the global focus-ring utility for consistent focus states
 * - Maintains consistent hover/active states
 * - Ensures proper hit target sizes for accessibility
 * - Supports light/dark mode with appropriate contrast
 * - Includes subtle hover animations and glow effects
 */
type PrimaryCTAProps = {
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  ariaLabel: string;
  loadingLabel?: string;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  size?: 'md' | 'lg';
  fullWidth?: boolean;
  id?: string;
  dataTestId?: string;
};

export default function PrimaryCTA({
  children,
  onClick,
  ariaLabel,
  loadingLabel,
  loading = false,
  type = 'button',
  autoFocus = false,
  disabled,
  className,
  size = 'lg',
  fullWidth = true,
  id,
  dataTestId,
}: PrimaryCTAProps) {
  const isLoading = Boolean(loading);
  const a11yLabel = isLoading && loadingLabel ? loadingLabel : ariaLabel;

  const base =
    'relative inline-flex items-center justify-center overflow-hidden group rounded-xl font-semibold tracking-tight shadow-lg transition-all duration-200 ease-out focus-ring cursor-pointer';
  const color =
    'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-50';
  const sizing =
    size === 'lg'
      ? 'min-h-[56px] px-8 text-base sm:min-h-[60px] sm:px-10 sm:text-lg'
      : 'min-h-[48px] px-6 text-sm';
  const width = fullWidth ? 'w-full' : '';

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = e => {
    if (disabled || isLoading) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };

  return (
    <button
      id={id}
      data-testid={dataTestId}
      type={type}
      onClick={handleClick}
      aria-label={a11yLabel}
      autoFocus={autoFocus}
      disabled={disabled || isLoading}
      aria-disabled={disabled || isLoading ? 'true' : 'false'}
      className={clsx(
        base,
        color,
        sizing,
        width,
        'hover:scale-[1.01] active:scale-[0.98] ring-1 ring-black/10 dark:ring-white/10 hover:ring-black/20 dark:hover:ring-white/20',
        // luminous subtle glow using before pseudo-element
        'before:pointer-events-none before:absolute before:inset-0 before:rounded-xl before:opacity-0 before:transition-opacity before:duration-300',
        'before:bg-[radial-gradient(80%_60%_at_50%_0%,rgba(255,255,255,0.35),transparent_60%)]',
        'group-hover:before:opacity-100',
        isLoading && 'opacity-80',
        className
      )}
    >
      <span
        className={clsx(
          'transition-opacity duration-200',
          isLoading ? 'opacity-0' : 'opacity-100'
        )}
      >
        {children}
      </span>

      {isLoading && (
        <div
          className='absolute inset-0 flex items-center justify-center pointer-events-none'
          aria-hidden='true'
        >
          <LoadingSpinner size='sm' variant='light' />
        </div>
      )}
    </button>
  );
}
