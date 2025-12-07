'use client';

import * as Clerk from '@clerk/elements/common';

interface AuthInputProps {
  type: 'email' | 'text';
  inputMode?: 'text' | 'numeric';
  autoComplete?: string;
  maxLength?: number;
  variant?: 'default' | 'otp';
}

const baseClasses =
  'w-full rounded-lg border border-input bg-background text-primary-token focus:outline-none focus:ring-2 focus:ring-ring focus:border-input';

const variantClasses = {
  default: 'px-3 py-2',
  otp: 'px-3 py-3 text-2xl tracking-[0.3em] text-center font-mono',
} as const;

export function AuthInput({
  type,
  inputMode,
  autoComplete,
  maxLength,
  variant = 'default',
}: AuthInputProps) {
  return (
    <Clerk.Input
      type={type}
      inputMode={inputMode}
      autoComplete={autoComplete}
      maxLength={maxLength}
      className={`${baseClasses} ${variantClasses[variant]}`}
    />
  );
}
