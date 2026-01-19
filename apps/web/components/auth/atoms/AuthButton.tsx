'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { cn } from '@/lib/utils';

const authButtonVariants = cva(
  [
    // Base styles
    'w-full rounded-[6px] flex items-center justify-center gap-2',
    'disabled:opacity-70 disabled:cursor-not-allowed',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6c78e6]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f5] dark:focus-visible:ring-offset-[#090909]',
    // Mobile-optimized height (min 48px for touch targets)
    'h-11 sm:h-11 min-h-[44px]',
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
          'bg-[#2a2d32] border border-[#34383f] px-[14px] text-[13px] leading-5 font-medium text-[#f0f1f3]',
          'hover:bg-[#30343a] active:bg-[#23262b]',
        ].join(' '),
        primaryLight: [
          'bg-[#2a2d32] border border-[#34383f] px-[14px] text-[13px] leading-5 font-medium text-[#f0f1f3]',
          'hover:bg-[#30343a] active:bg-[#23262b]',
        ].join(' '),
        oauthPrimary: [
          'bg-[#5b5fc9] border border-[#6c78e6] px-[14px] text-[13px] leading-5 font-medium text-[#fefeff]',
          'hover:bg-[#5256bf] active:bg-[#474bb3]',
        ].join(' '),
        secondary: [
          'bg-[#1f2227] border border-[#2c2e33] px-[14px] text-[13px] leading-5 font-medium text-[#e3e4e6]',
          'hover:bg-[#25282d] active:bg-[#1a1d21]',
        ].join(' '),
        link: [
          'bg-transparent p-0 h-auto min-h-0 text-[13px] font-[450] text-[#6b6f76] dark:text-[#969799]',
          'hover:text-[#1f2023] dark:hover:text-[#e3e4e6]',
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
