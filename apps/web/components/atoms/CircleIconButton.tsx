'use client';

import { Slot } from '@radix-ui/react-slot';
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
  | 'outline';

export interface CircleIconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
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

const variantStyles: Record<CircleIconButtonVariant, string> = {
  // Surface - elevated card style with subtle border
  surface: cn(
    'border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) text-(--linear-text-primary)',
    'shadow-sm',
    'hover:bg-(--linear-bg-surface-2) hover:text-(--linear-text-primary) hover:shadow-md'
  ),
  // Frosted - glassmorphic with backdrop blur
  frosted: cn(
    'border border-(--linear-border-subtle) bg-[color-mix(in_srgb,var(--linear-bg-surface-1)_84%,transparent)] text-(--linear-text-primary) backdrop-blur-sm',
    'shadow-sm',
    'hover:bg-[color-mix(in_srgb,var(--linear-bg-surface-2)_88%,transparent)]'
  ),
  // Ghost - transparent with hover background
  ghost: cn(
    'bg-transparent text-(--linear-text-secondary)',
    'hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary)'
  ),
  // Secondary - subtle background without border
  secondary: cn(
    'bg-(--linear-bg-surface-2) text-(--linear-text-secondary)',
    'shadow-sm',
    'hover:bg-(--linear-bg-surface-3) hover:text-(--linear-text-primary)'
  ),
  // Outline - transparent with visible border
  outline: cn(
    'border border-(--linear-border-subtle) bg-transparent text-(--linear-text-tertiary)',
    'hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary)'
  ),
};

const baseStyles = cn(
  // Shape and layout
  'inline-flex items-center justify-center rounded-full',
  // Transitions
  'transition-all duration-150 ease-out',
  // Active state
  'active:scale-95',
  // Focus ring using design system utility
  'focus-ring-themed',
  'focus-visible:ring-offset-[var(--color-bg-base)]',
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
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : type}
      className={cn(
        baseStyles,
        sizeStyles[size],
        iconSizeStyles[size],
        variantStyles[variant],
        className
      )}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </Comp>
  );
});

CircleIconButton.displayName = 'CircleIconButton';
