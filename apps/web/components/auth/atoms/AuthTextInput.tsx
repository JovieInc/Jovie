'use client';

import { Input } from '@jovie/ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

const authTextInputClasses =
  'border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-0)] text-[var(--linear-text-primary)] placeholder:text-[var(--linear-text-tertiary)] rounded-[var(--linear-radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--linear-border-focus)]/40 focus-visible:ring-offset-2 h-[var(--linear-button-height-md)] min-h-[40px] px-3 text-[var(--linear-caption-size)] font-[var(--linear-caption-weight)]';

type AuthTextInputVariant = 'default' | 'otp';

const variantClasses: Record<AuthTextInputVariant, string> = {
  default: '',
  otp: 'text-2xl tracking-[0.3em] text-center font-sans',
} as const;

export interface AuthTextInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  readonly variant?: AuthTextInputVariant;
}

export const AuthTextInput = React.forwardRef<
  HTMLInputElement,
  AuthTextInputProps
>(({ className, variant = 'default', ...props }, ref) => {
  return (
    <Input
      ref={ref}
      inputSize='lg'
      className={cn(authTextInputClasses, variantClasses[variant], className)}
      {...props}
    />
  );
});

AuthTextInput.displayName = 'AuthTextInput';
