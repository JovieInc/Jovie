'use client';

import { Input } from '@jovie/ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

const authTextInputClasses =
  'border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) text-(--linear-text-primary) placeholder:text-(--linear-text-tertiary) rounded-(--linear-radius-sm) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/40 focus-visible:ring-offset-2 h-(--linear-button-height-md) min-h-[40px] px-3 text-(--linear-caption-size) font-(--linear-caption-weight)';

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
