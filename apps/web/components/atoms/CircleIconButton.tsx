'use client';

import { Button } from '@jovie/ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * CircleIconButton - Unified circular icon button component
 *
 * A shared component for all small circle buttons across profiles and auth screens.
 * Supports full design token usage and light/dark mode theming.
 *
 * @example
 * // Surface variant (default) - elevated card style
 * <CircleIconButton ariaLabel="Back" onClick={goBack}>
 *   <ArrowLeft className="h-4 w-4" />
 * </CircleIconButton>
 *
 * @example
 * // Frosted variant - glassmorphic with blur
 * <CircleIconButton variant="frosted" ariaLabel="Menu">
 *   <Menu className="h-4 w-4" />
 * </CircleIconButton>
 *
 * @example
 * // As a link using asChild
 * <CircleIconButton asChild ariaLabel="Back to profile">
 *   <Link href="/profile"><ArrowLeft /></Link>
 * </CircleIconButton>
 */

export type CircleIconButtonSize = 'xs' | 'sm' | 'md' | 'lg';
export type CircleIconButtonVariant =
  | 'surface'
  | 'frosted'
  | 'ghost'
  | 'secondary'
  | 'outline'
  | 'pearl'
  | 'pearlQuiet';

export interface CircleIconButtonProps
  extends Omit<
    React.ComponentProps<typeof Button>,
    'size' | 'variant' | 'asChild'
  > {
  /** Button content (typically an icon) */
  readonly children: React.ReactNode;
  /** Accessible label for screen readers */
  readonly ariaLabel: string;
  /** Button size - xs: 32px, sm: 36px, md: 40px, lg: 44px */
  readonly size?: CircleIconButtonSize;
  /** Visual variant */
  readonly variant?: CircleIconButtonVariant;
  /** Render as child element (for Link, etc.) */
  readonly asChild?: boolean;
  /** Additional class names */
  readonly className?: string;
}

const sizeStyles: Record<CircleIconButtonSize, string> = {
  xs: 'h-8 w-8', // 32px - compact, good for dense UIs
  sm: 'h-9 w-9', // 36px - default for most use cases
  md: 'h-10 w-10', // 40px - standard touch target
  lg: 'h-11 w-11', // 44px - large touch target (mobile-first)
};

const iconSizeStyles: Record<CircleIconButtonSize, string> = {
  xs: '[&>svg]:h-4 [&>svg]:w-4',
  sm: '[&>svg]:h-4 [&>svg]:w-4',
  md: '[&>svg]:h-5 [&>svg]:w-5',
  lg: '[&>svg]:h-5 [&>svg]:w-5',
};

const variantStyles: Record<
  CircleIconButtonVariant,
  {
    buttonVariant: React.ComponentProps<typeof Button>['variant'];
    className: string;
  }
> = {
  // Surface - elevated card style with subtle border
  surface: {
    buttonVariant: 'secondary',
    className: cn(
      'border border-subtle bg-surface-1 text-primary-token',
      'shadow-sm',
      'hover:bg-surface-2 hover:text-primary-token hover:shadow-md'
    ),
  },
  // Frosted - glassmorphic with backdrop blur
  frosted: {
    buttonVariant: 'frosted-ghost',
    className: cn(
      'border border-subtle bg-[color-mix(in_srgb,var(--linear-bg-surface-1)_84%,transparent)] text-primary-token backdrop-blur-sm',
      'shadow-sm',
      'hover:bg-[color-mix(in_srgb,var(--linear-bg-surface-2)_88%,transparent)]'
    ),
  },
  // Ghost - transparent with hover background
  ghost: {
    buttonVariant: 'ghost',
    className: cn(
      'bg-transparent text-secondary-token',
      'hover:bg-surface-1 hover:text-primary-token'
    ),
  },
  // Secondary - subtle background without border
  secondary: {
    buttonVariant: 'secondary',
    className: cn(
      'bg-surface-2 text-secondary-token',
      'shadow-sm',
      'hover:bg-surface-3 hover:text-primary-token'
    ),
  },
  // Outline - transparent with visible border
  outline: {
    buttonVariant: 'outline',
    className: cn(
      'border border-subtle bg-transparent text-tertiary-token',
      'hover:bg-surface-1 hover:text-primary-token'
    ),
  },
  // Pearl - public profile chrome
  pearl: {
    buttonVariant: 'ghost',
    className: cn(
      'border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg)] text-primary-token backdrop-blur-xl',
      'shadow-[var(--profile-pearl-shadow)]',
      'hover:bg-[var(--profile-pearl-bg-hover)] hover:text-primary-token',
      'active:bg-[var(--profile-pearl-bg-active)]'
    ),
  },
  pearlQuiet: {
    buttonVariant: 'ghost',
    className: cn(
      'border border-transparent bg-transparent text-primary-token/78 backdrop-blur-xl',
      'shadow-none',
      'hover:border-[color:var(--profile-pearl-border)] hover:bg-[color:color-mix(in_srgb,var(--profile-pearl-bg)_88%,transparent)] hover:text-primary-token hover:shadow-[0_10px_24px_rgba(10,12,18,0.1)]',
      'focus-visible:border-[color:var(--profile-pearl-border)] focus-visible:bg-[color:color-mix(in_srgb,var(--profile-pearl-bg)_92%,transparent)] focus-visible:text-primary-token focus-visible:shadow-[0_10px_24px_rgba(10,12,18,0.12)]',
      'active:bg-[var(--profile-pearl-bg-active)] active:text-primary-token'
    ),
  },
};

const baseStyles = cn(
  // Shape and layout
  'inline-flex items-center justify-center rounded-full',
  // Transitions
  'transition-all duration-150 ease-out',
  // Active state
  'active:scale-95',
  // Required for soft material treatments on profile chrome
  'relative isolate overflow-hidden',
  // Touch optimizations
  'touch-manipulation select-none',
  '[-webkit-tap-highlight-color:transparent]',
  // Cursor
  'cursor-pointer'
);

export const CircleIconButton = React.forwardRef<
  HTMLButtonElement,
  CircleIconButtonProps
>(function CircleIconButton(
  {
    children,
    ariaLabel,
    size = 'sm',
    variant = 'surface',
    asChild = false,
    className,
    type = 'button',
    ...props
  },
  ref
) {
  const variantConfig = variantStyles[variant];

  return (
    <Button
      ref={ref}
      asChild={asChild}
      type={asChild ? undefined : type}
      variant={variantConfig.buttonVariant}
      size='icon'
      className={cn(
        baseStyles,
        sizeStyles[size],
        iconSizeStyles[size],
        variantConfig.className,
        className
      )}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </Button>
  );
});

CircleIconButton.displayName = 'CircleIconButton';
