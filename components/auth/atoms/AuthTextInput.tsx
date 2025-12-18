'use client';

import { Input } from '@jovie/ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

const authTextInputClasses =
  'border border-white/10 bg-[#15161a] text-white placeholder:text-[#6b6f76] focus-visible:ring-2 focus-visible:ring-zinc-600 focus-visible:ring-offset-0 rounded-lg';

type AuthTextInputVariant = 'default' | 'otp';

const variantClasses: Record<AuthTextInputVariant, string> = {
  default: '',
  otp: 'text-2xl tracking-[0.3em] text-center font-mono',
} as const;

export interface AuthTextInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  variant?: AuthTextInputVariant;
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
