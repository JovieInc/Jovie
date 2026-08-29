import type * as React from 'react';

import { cn } from '../lib/utils';

type RoundedVariant = 'none' | 'sm' | 'md' | 'lg' | 'full';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Border radius variant
   * @default 'sm'
   */
  readonly rounded?: RoundedVariant;
  /**
   * When true, applies the canonical shimmer animation and loading state attrs.
   * @default true
   */
  readonly shimmer?: boolean;
}

const roundedClasses: Record<RoundedVariant, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

const SKELETON_FILL_CLASS = 'bg-(--color-skeleton-base)';
const REDUCED_MOTION_CLASS =
  'motion-reduce:animate-none motion-reduce:[background-image:none]';

function omitAnnouncementProps(
  props: React.HTMLAttributes<HTMLDivElement>
): React.HTMLAttributes<HTMLDivElement> {
  const {
    role: _role,
    'aria-hidden': _ariaHidden,
    'aria-busy': _ariaBusy,
    'aria-live': _ariaLive,
    'aria-atomic': _ariaAtomic,
    'aria-label': _ariaLabel,
    'aria-labelledby': _ariaLabelledBy,
    'aria-describedby': _ariaDescribedBy,
    ...safeProps
  } = props;

  return safeProps;
}

/**
 * Decorative skeleton placeholder. Geometry, fill tokens, and reduced-motion
 * behavior live here; announcement ownership lives on `LoadingSkeleton`.
 *
 * Shimmer uses the shared `.skeleton` class (canonical
 * `--color-skeleton-base` / `--color-skeleton-shimmer`). Static fill uses the
 * same base token. `prefers-reduced-motion` removes the shimmer without
 * changing the reserved box or loading meaning.
 */
export function Skeleton({
  className,
  rounded = 'sm',
  shimmer = true,
  ...props
}: SkeletonProps) {
  const safeProps = omitAnnouncementProps(props);
  const state = shimmer ? 'shimmer' : 'static';

  return (
    <div
      {...safeProps}
      className={cn(
        SKELETON_FILL_CLASS,
        shimmer && 'skeleton',
        REDUCED_MOTION_CLASS,
        roundedClasses[rounded],
        className
      )}
      data-state={state}
      aria-hidden='true'
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
  /** Accessible text announced while the placeholder is busy. */
  readonly label?: string;
}

/**
 * Configurable skeleton with support for multiple lines.
 * Last line renders at 75% width for natural text appearance.
 * This wrapper is the single `role="status"` / `aria-busy` / live-region owner.
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
  label = 'Loading content',
}: LoadingSkeletonProps) {
  const normalizedLines = Number.isFinite(lines)
    ? Math.max(1, Math.floor(lines))
    : 1;
  const lineKeys = Array.from(
    { length: normalizedLines },
    (_, lineNumber) => `skeleton-line-${lineNumber}`
  );

  return (
    <div
      className={cn(width, normalizedLines > 1 && 'space-y-2')}
      role='status'
      aria-busy='true'
      aria-live='polite'
      aria-atomic='true'
      data-state='loading'
      data-lines={normalizedLines}
    >
      <span className='sr-only'>{label}</span>
      {lineKeys.map((key, index) => (
        <Skeleton
          key={key}
          className={cn(
            height,
            normalizedLines > 1 && index === normalizedLines - 1
              ? 'w-3/4'
              : width,
            className
          )}
          rounded={rounded}
        />
      ))}
    </div>
  );
}
