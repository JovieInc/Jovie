'use client';

import { Input } from '@jovie/ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

type AuthInputVariant = 'default' | 'otp';

interface AuthInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'type' | 'size' | 'children'
  > {
  readonly type: 'email' | 'text';
  readonly variant?: AuthInputVariant;
  /**
   * Error state - applies error styling
   */
  readonly error?: boolean;
}

const authInputClasses = cn(
  // Base styling - subtle borders for premium feel
  'border border-subtle bg-white dark:bg-surface-1 text-primary-token',
  'placeholder:text-tertiary-token',
  'rounded-[6px]',
  // Focus ring
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0',
  // Mobile-optimized sizing - min 44px height for touch targets
  'h-[44px] min-h-[44px]',
  // Typography
  'text-[13px] leading-5',
  // Touch optimizations
  'touch-manipulation',
  '[-webkit-tap-highlight-color:transparent]',
  // Transitions
  'transition-colors duration-150'
);

const variantClasses: Record<AuthInputVariant, string> = {
  default: '',
  otp: 'text-2xl tracking-[0.3em] text-center font-sans',
} as const;

/**
 * Auth-optimized input component with mobile keyboard optimizations.
 * No longer depends on Clerk Elements - uses standard React input.
 */
export const AuthInput = React.forwardRef<HTMLInputElement, AuthInputProps>(
  function AuthInput(
    {
      type,
      inputMode,
      autoComplete,
      maxLength,
      variant = 'default',
      placeholder,
      autoCapitalize,
      autoCorrect,
      spellCheck,
      name,
      enterKeyHint,
      error,
      className,
      ...rest
    },
    ref
  ) {
    // Email-specific optimizations for mobile keyboards
    const resolvedAutoCapitalize =
      autoCapitalize ?? (type === 'email' ? 'none' : undefined);
    const resolvedAutoCorrect =
      autoCorrect ?? (type === 'email' ? 'off' : undefined);
    const resolvedSpellCheck =
      spellCheck ?? (type === 'email' ? false : undefined);
    // Use email input mode for email type to show @ and .com keys on mobile
    const resolvedInputMode =
      inputMode ?? (type === 'email' ? 'email' : undefined);
    // Default enter key hint to 'next' for forms
    const resolvedEnterKeyHint = enterKeyHint ?? 'next';

    return (
      <Input
        ref={ref}
        type={type}
        inputMode={resolvedInputMode}
        autoComplete={autoComplete}
        autoCapitalize={resolvedAutoCapitalize}
        autoCorrect={resolvedAutoCorrect}
        spellCheck={resolvedSpellCheck}
        maxLength={maxLength}
        name={name}
        enterKeyHint={resolvedEnterKeyHint}
        inputSize='md'
        placeholder={placeholder}
        variant={error ? 'error' : 'default'}
        className={cn(
          authInputClasses,
          variantClasses[variant],
          error && 'border-destructive focus-visible:ring-destructive',
          className
        )}
        aria-invalid={error || undefined}
        {...rest}
      />
    );
  }
);

AuthInput.displayName = 'AuthInput';
