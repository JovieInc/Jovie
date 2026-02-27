'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { cn } from '@/lib/utils';

const authButtonVariants = cva(
  [
    // Base styles
    'w-full rounded-[var(--linear-radius-sm)] flex items-center justify-center gap-[var(--linear-gap-buttons)]',
    'disabled:opacity-70 disabled:cursor-not-allowed',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--linear-border-focus)]/40 focus-visible:ring-offset-2',
    // Mobile-optimized height matching Linear
    'h-[var(--linear-button-height-md)] sm:h-[var(--linear-button-height-md)] min-h-[40px]',
    // Touch-optimized transitions
    'transition-all duration-150 ease-out',
    // Active press state for mobile
    'active:scale-[0.98] active:opacity-90',
    // Prevent text selection on touch
    'select-none touch-manipulation',
    // Smooth tap highlight removal for iOS
    '[-webkit-tap-highlight-color:transparent]',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: [
          'bg-[var(--linear-btn-primary-bg)] border border-[var(--linear-btn-primary-border)] px-[14px] text-[var(--linear-caption-size)] font-[var(--linear-caption-weight)] text-[var(--linear-btn-primary-fg)] shadow-[var(--linear-shadow-button)]',
          'hover:opacity-90',
        ].join(' '),
        primaryLight: [
          'bg-[var(--linear-btn-secondary-bg)] border border-[var(--linear-border-subtle)] px-[14px] text-[var(--linear-caption-size)] font-[var(--linear-caption-weight)] text-[var(--linear-text-primary)]',
          'hover:bg-[var(--linear-btn-secondary-hover)]',
        ].join(' '),
        oauthPrimary: [
          'bg-[var(--linear-btn-secondary-bg)] border border-[var(--linear-border-subtle)] px-[14px] text-[var(--linear-caption-size)] font-[var(--linear-caption-weight)] text-[var(--linear-text-primary)]',
          'hover:bg-[var(--linear-btn-secondary-hover)]',
        ].join(' '),
        secondary: [
          'bg-[var(--linear-btn-secondary-bg)] border border-[var(--linear-border-subtle)] px-[14px] text-[var(--linear-caption-size)] font-[var(--linear-caption-weight)] text-[var(--linear-text-primary)]',
          'hover:bg-[var(--linear-btn-secondary-hover)]',
        ].join(' '),
        link: [
          'bg-transparent p-0 h-auto min-h-0 text-[13px] font-[450] text-[var(--linear-text-secondary)]',
          'hover:text-[var(--linear-text-primary)]',
          'active:scale-100 active:opacity-70',
        ].join(' '),
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  }
);

export interface AuthButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof authButtonVariants> {
  /** Whether to trigger haptic feedback on press */
  readonly hapticFeedback?: boolean;
}

export const AuthButton = React.forwardRef<HTMLButtonElement, AuthButtonProps>(
  (
    { className, variant, type, hapticFeedback = true, onClick, ...props },
    ref
  ) => {
    const haptic = useHapticFeedback();

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        // Trigger haptic feedback on press (not for link variant)
        if (hapticFeedback && variant !== 'link') {
          haptic.light();
        }
        onClick?.(e);
      },
      [hapticFeedback, variant, haptic, onClick]
    );

    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={cn(authButtonVariants({ variant }), className)}
        onClick={handleClick}
        {...props}
      />
    );
  }
);

AuthButton.displayName = 'AuthButton';

export { authButtonVariants };
