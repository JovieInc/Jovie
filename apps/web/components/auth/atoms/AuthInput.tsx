'use client';

import * as Clerk from '@clerk/elements/common';
import { Input } from '@jovie/ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

type AuthInputVariant = 'default' | 'otp';

interface AuthInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'type' | 'size' | 'children'
  > {
  type: 'email' | 'text';
  variant?: AuthInputVariant;
}

const authInputClasses = cn(
  // Base styling
  'border border-subtle bg-surface-0 text-primary-token',
  'placeholder:text-tertiary-token',
  'rounded-xl',
  // Focus ring
  'focus-ring-themed focus-visible:ring-offset-(--color-bg-base)',
  // Mobile-optimized sizing - min 48px height for touch targets
  'h-12 min-h-[48px]',
  // iOS zoom prevention - 16px minimum font size
  'text-base sm:text-[15px]',
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

export function AuthInput({
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
  ...rest
}: AuthInputProps) {
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
    <Clerk.Input
      type={type}
      inputMode={resolvedInputMode}
      autoComplete={autoComplete}
      autoCapitalize={resolvedAutoCapitalize}
      autoCorrect={resolvedAutoCorrect}
      spellCheck={resolvedSpellCheck}
      maxLength={maxLength}
      name={name}
      enterKeyHint={resolvedEnterKeyHint}
      {...rest}
      asChild
    >
      <Input
        inputSize='lg'
        placeholder={placeholder}
        className={cn(authInputClasses, variantClasses[variant])}
      />
    </Clerk.Input>
  );
}
