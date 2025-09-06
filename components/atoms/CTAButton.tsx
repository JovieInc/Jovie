'use client';

import { CheckIcon } from '@heroicons/react/24/solid';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import React, { forwardRef, useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

/**
 * CTAButton Component
 *
 * A versatile button component that can be rendered as either a button or a link.
 * Follows standardized button styling guidelines:
 * - Uses the global focus-ring utility for consistent focus states
 * - Maintains consistent hover/active states across variants
 * - Ensures proper hit target sizes for accessibility
 * - Supports light/dark mode with appropriate contrast
 */
export interface CTAButtonProps {
  /** The URL the button should navigate to */
  href?: string;
  /** Button content */
  children: React.ReactNode;
  /** Visual style variant */
  variant?: 'primary' | 'secondary' | 'outline' | 'white';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
  /** Whether the link should open in a new tab */
  external?: boolean;
  /** Whether the button is in a loading state */
  isLoading?: boolean;
  /** Whether the button is in a success state */
  isSuccess?: boolean;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Optional icon to display before text */
  icon?: React.ReactNode;
  /** Optional click handler (for button mode) */
  onClick?: (
    e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>
  ) => void;
  /** Optional aria-label for better accessibility */
  ariaLabel?: string;
  /** Whether to use reduced motion */
  reducedMotion?: boolean;
  /** Type attribute for button mode */
  type?: 'button' | 'submit' | 'reset';
}

const BASE_CLASSES =
  'relative isolate inline-flex items-center justify-center font-medium transition-all duration-200 focus-ring';

const VARIANT_CLASSES = {
  primary:
    'bg-neutral-900 text-white hover:opacity-90 active:scale-[0.98] dark:bg-white dark:text-black dark:hover:opacity-90 shadow-sm hover:shadow-md',
  secondary:
    'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98] dark:bg-indigo-500 dark:hover:bg-indigo-600 shadow-md hover:shadow-lg',
  outline:
    'border border-current text-current hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-[0.98]',
  white:
    'bg-white text-black hover:bg-gray-50 active:scale-[0.98] border border-gray-200 dark:bg-white dark:text-black dark:hover:bg-gray-100 dark:border-gray-300 focus-ring-transparent-offset shadow-sm hover:shadow-md',
} as const;

const SIZE_CLASSES = {
  sm: 'px-3 py-1.5 text-sm rounded-lg gap-1.5 min-h-[32px]',
  md: 'px-4 py-2 text-base rounded-xl gap-2 min-h-[40px]',
  lg: 'px-8 py-3 text-lg rounded-xl gap-2.5 min-h-[48px]',
} as const;

const ICON_SIZES = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
} as const;

function getButtonClasses({
  variant,
  size,
  className,
  disabled,
}: {
  variant: keyof typeof VARIANT_CLASSES;
  size: keyof typeof SIZE_CLASSES;
  className?: string;
  disabled?: boolean;
}) {
  return cn(
    BASE_CLASSES,
    disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className
  );
}

const CONTENT_VARIANTS = {
  hidden: { opacity: 0, y: 5 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -5 },
};

const SUCCESS_VARIANTS = {
  hidden: { scale: 0.5, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: 'spring', stiffness: 500, damping: 15, duration: 0.3 },
  },
  exit: { scale: 0.5, opacity: 0 },
};

export const CTAButton = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  CTAButtonProps
>(
  (
    {
      href,
      children,
      variant = 'primary',
      size = 'md',
      className = '',
      external = false,
      isLoading = false,
      isSuccess = false,
      disabled = false,
      icon,
      onClick,
      ariaLabel,
      reducedMotion = false,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const { theme, systemTheme } = useTheme();
    const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('light');
    const [showSuccess, setShowSuccess] = useState(false);
    // Use the hook to detect system preference for reduced motion
    const systemPrefersReducedMotion = useReducedMotion();
    // Respect both system preference and prop (if explicitly set)
    const shouldReduceMotion = reducedMotion || systemPrefersReducedMotion;

    // Update current theme based on system/user preference
    useEffect(() => {
      const effectiveTheme = theme === 'system' ? systemTheme : theme;
      setCurrentTheme(effectiveTheme === 'dark' ? 'dark' : 'light');
    }, [theme, systemTheme]);

    // Handle success state with animation timing
    useEffect(() => {
      if (isSuccess) {
        setShowSuccess(true);
      } else {
        setShowSuccess(false);
      }
    }, [isSuccess]);

    // Compute button classes
    const buttonClasses = getButtonClasses({
      variant,
      size,
      className,
      disabled,
    });

    // Render button content based on state
    const renderContent = () => (
      <AnimatePresence mode='wait' initial={false}>
        {isSuccess && showSuccess ? (
          <motion.div
            key='success'
            className='absolute inset-0 flex items-center justify-center'
            initial='hidden'
            animate='visible'
            exit='exit'
            variants={shouldReduceMotion ? {} : SUCCESS_VARIANTS}
          >
            <CheckIcon
              className={`${ICON_SIZES[size]} text-current`}
              aria-hidden='true'
            />
          </motion.div>
        ) : isLoading ? (
          <motion.div
            key='loading'
            className='absolute inset-0 flex items-center justify-center'
            initial='hidden'
            animate='visible'
            exit='exit'
            variants={shouldReduceMotion ? {} : CONTENT_VARIANTS}
          >
            <Spinner
              size={size === 'lg' ? 'md' : size === 'md' ? 'sm' : 'sm'}
              variant={
                variant === 'white'
                  ? 'dark' // White buttons need dark spinner
                  : variant === 'primary'
                    ? currentTheme === 'dark'
                      ? 'dark'
                      : 'light' // Primary: light spinner on dark theme, dark spinner on light theme
                    : variant === 'secondary'
                      ? 'light' // Secondary always has dark background, needs light spinner
                      : 'auto' // Outline uses auto to match current theme
              }
            />
          </motion.div>
        ) : (
          <motion.div
            key='content'
            className='flex items-center justify-center'
            initial='hidden'
            animate='visible'
            exit='exit'
            variants={shouldReduceMotion ? {} : CONTENT_VARIANTS}
          >
            {icon && <span className='flex-shrink-0'>{icon}</span>}
            <span>{children}</span>
          </motion.div>
        )}
      </AnimatePresence>
    );

    // Common props for both button and link
    const commonProps = {
      className: buttonClasses,
      'aria-label':
        ariaLabel || (typeof children === 'string' ? children : undefined),
      'data-state': isSuccess
        ? 'success'
        : isLoading
          ? 'loading'
          : disabled
            ? 'disabled'
            : 'idle',
      'data-theme': currentTheme,
      'data-reduced-motion': shouldReduceMotion,
      onClick:
        !disabled && !isLoading
          ? onClick
          : (e: React.MouseEvent) => e.preventDefault(),
    };

    // If href is provided and not disabled, render as a link
    if (href && !disabled && !isLoading) {
      if (external) {
        return (
          <a
            ref={ref as React.Ref<HTMLAnchorElement>}
            href={href}
            target='_blank'
            rel='noopener noreferrer'
            aria-disabled={disabled ? 'true' : undefined}
            {...commonProps}
            {...props}
          >
            {renderContent()}
          </a>
        );
      }

      return (
        <Link
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          aria-disabled={disabled ? 'true' : undefined}
          {...commonProps}
          {...props}
        >
          {renderContent()}
        </Link>
      );
    }

    // Otherwise, render as a button
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        aria-live={isLoading || isSuccess ? 'polite' : undefined}
        {...commonProps}
        {...props}
      >
        {renderContent()}
      </button>
    );
  }
);

CTAButton.displayName = 'CTAButton';
