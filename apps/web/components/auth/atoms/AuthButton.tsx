'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { cn } from '@/lib/utils';

const authButtonVariants = cva(
  [
    // Base styles
    'w-full rounded-xl flex items-center justify-center gap-3',
    'disabled:opacity-70 disabled:cursor-not-allowed',
    'focus-ring-themed focus-visible:ring-offset-(--color-bg-base)',
    // Mobile-optimized height (min 48px for touch targets)
    'h-12 sm:h-12 min-h-[48px]',
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
          'bg-btn-primary px-4 text-[15px] leading-5 font-medium text-btn-primary-foreground',
          'shadow-(--shadow-sm)',
          'hover:opacity-90',
          'active:shadow-none',
        ].join(' '),
        primaryLight: [
          'border border-subtle bg-surface-0 px-4 text-[15px] leading-5 font-medium text-primary-token',
          'shadow-(--shadow-sm)',
          'hover:bg-surface-1',
          'active:bg-surface-2 active:shadow-none',
        ].join(' '),
        oauthPrimary: [
          'bg-btn-primary px-4 text-[15px] leading-5 font-medium text-btn-primary-foreground',
          'shadow-(--shadow-sm)',
          'hover:opacity-90',
          'active:shadow-none',
        ].join(' '),
        secondary: [
          'border border-subtle bg-surface-0 px-4 text-[15px] leading-5 font-medium text-primary-token',
          'shadow-(--shadow-sm)',
          'hover:bg-surface-1',
          'active:bg-surface-2 active:shadow-none',
        ].join(' '),
        link: [
          'bg-transparent p-0 h-auto min-h-0 text-sm text-secondary-token',
          'hover:text-primary-token',
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
  hapticFeedback?: boolean;
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
