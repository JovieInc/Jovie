'use client';

import { Input } from '@jovie/ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

const authTextInputClasses =
  'border border-subtle bg-surface-0 text-primary-token placeholder:text-tertiary-token rounded-[--radius-xl] focus-ring-themed focus-visible:ring-offset-(--color-bg-base)';

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
