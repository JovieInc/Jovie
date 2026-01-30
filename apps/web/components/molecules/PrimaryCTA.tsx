'use client';

import { Button, type ButtonProps } from '@jovie/ui';
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
  readonly ariaLabel: string;
  readonly loadingLabel?: string;
  readonly loading?: boolean;
  readonly size?: 'md' | 'lg';
  readonly fullWidth?: boolean;
  readonly dataTestId?: string;
}

export function PrimaryCTA({
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
  const mappedSize: ButtonProps['size'] = size === 'md' ? 'default' : 'lg';

  return (
    <Button
      variant='primary'
      size={mappedSize}
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
