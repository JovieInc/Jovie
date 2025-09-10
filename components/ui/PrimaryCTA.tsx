'use client';

import React from 'react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

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
interface PrimaryCTAProps
  extends Omit<ButtonProps, 'variant' | 'size' | 'loading'> {
  ariaLabel: string;
  loadingLabel?: string;
  loading?: boolean;
  size?: 'md' | 'lg';
  fullWidth?: boolean;
  dataTestId?: string;
}

export default function PrimaryCTA({
  children,
  ariaLabel,
  loadingLabel,
  loading = false,
  size = 'lg',
  fullWidth = true,
  className,
  dataTestId,
  ...props
}: PrimaryCTAProps) {
  const a11yLabel = loading && loadingLabel ? loadingLabel : ariaLabel;

  return (
    <Button
      variant='primary'
      size={size}
      loading={loading}
      aria-label={a11yLabel}
      data-testid={dataTestId}
      className={cn(fullWidth ? 'w-full' : '', className)}
      {...props}
    >
      {children}
    </Button>
  );
}
