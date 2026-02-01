'use client';

import * as React from 'react';

import { cn } from '../lib/utils';

type RoundedVariant = 'none' | 'sm' | 'md' | 'lg' | 'full';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Border radius variant
   * @default 'sm'
   */
  readonly rounded?: RoundedVariant;
}

const roundedClasses: Record<RoundedVariant, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

/**
 * Base skeleton component with shimmer animation.
 * Uses the `.skeleton` CSS class defined in globals.css for the animation.
 * Respects `prefers-reduced-motion` automatically.
 *
 * @example
 * ```tsx
 * // Simple skeleton with width/height
 * <Skeleton className="h-4 w-full" />
 *
 * // Avatar skeleton
 * <Skeleton className="h-10 w-10" rounded="full" />
 *
 * // Card skeleton
 * <Skeleton className="h-32 w-full" rounded="lg" />
 * ```
 */
export function Skeleton({
  className,
  rounded = 'sm',
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        'skeleton motion-reduce:animate-none',
        roundedClasses[rounded],
        className
      )}
      aria-hidden='true'
      {...props}
    />
  );
}

export interface LoadingSkeletonProps {
  readonly className?: string;
  /**
   * Number of skeleton lines to render
   * @default 1
   */
  readonly lines?: number;
  /**
   * Height class (Tailwind utility like 'h-4', 'h-8')
   * @default 'h-4'
   */
  readonly height?: string;
  /**
   * Width class (Tailwind utility like 'w-full', 'w-1/2')
   * @default 'w-full'
   */
  readonly width?: string;
  /**
   * Border radius variant
   * @default 'sm'
   */
  readonly rounded?: RoundedVariant;
}

/**
 * Configurable skeleton with support for multiple lines.
 * Last line renders at 75% width for natural text appearance.
 *
 * @example
 * ```tsx
 * // Single line skeleton
 * <LoadingSkeleton height="h-4" width="w-48" />
 *
 * // Multi-line text skeleton
 * <LoadingSkeleton lines={3} height="h-4" />
 *
 * // Button skeleton
 * <LoadingSkeleton height="h-10" width="w-32" rounded="md" />
 * ```
 */
export function LoadingSkeleton({
  className,
  lines = 1,
  height = 'h-4',
  width = 'w-full',
  rounded = 'sm',
}: LoadingSkeletonProps) {
  if (lines === 1) {
    return (
      <Skeleton className={cn(height, width, className)} rounded={rounded} />
    );
  }

  // Generate stable keys for multi-line skeletons
  const lineKeys = React.useMemo(
    () => Array.from({ length: lines }, (_, i) => `skeleton-line-${i}`),
    [lines]
  );

  return (
    <div className='space-y-2' aria-hidden='true'>
      {lineKeys.map((key, index) => (
        <Skeleton
          key={key}
          className={cn(
            height,
            index === lines - 1 ? 'w-3/4' : width,
            className
          )}
          rounded={rounded}
        />
      ))}
    </div>
  );
}
