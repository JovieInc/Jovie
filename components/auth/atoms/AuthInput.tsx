'use client';

import * as Clerk from '@clerk/elements/common';
import { Input } from '@jovie/ui';
import { cn } from '@/lib/utils';

interface AuthInputProps {
  type: 'email' | 'text';
  inputMode?: 'text' | 'numeric';
  autoComplete?: string;
  maxLength?: number;
  variant?: 'default' | 'otp';
  placeholder?: string;
}

const authInputClasses =
  'border-0 bg-[#23252a] text-white placeholder:text-[#6b6f76] focus-visible:ring-1 focus-visible:ring-zinc-600 focus-visible:ring-offset-0 rounded-lg';

const variantClasses = {
  default: '',
  otp: 'text-2xl tracking-[0.5em] text-center font-medium placeholder:tracking-normal placeholder:text-base placeholder:font-normal',
} as const;

export function AuthInput({
  type,
  inputMode,
  autoComplete,
  maxLength,
  variant = 'default',
  placeholder,
}: AuthInputProps) {
  return (
    <Clerk.Input
      type={type}
      inputMode={inputMode}
      autoComplete={autoComplete}
      maxLength={maxLength}
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
