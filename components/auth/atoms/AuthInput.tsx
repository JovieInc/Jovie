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

const authInputClasses =
  'border border-subtle bg-surface-0 text-primary-token placeholder:text-tertiary-token rounded-lg focus-ring-themed focus-visible:ring-offset-(--color-bg-base)';

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
  ...rest
}: AuthInputProps) {
  const resolvedAutoCapitalize =
    autoCapitalize ?? (type === 'email' ? 'none' : undefined);
  const resolvedAutoCorrect =
    autoCorrect ?? (type === 'email' ? 'off' : undefined);
  const resolvedSpellCheck =
    spellCheck ?? (type === 'email' ? false : undefined);

  return (
    <Clerk.Input
      type={type}
      inputMode={inputMode}
      autoComplete={autoComplete}
      autoCapitalize={resolvedAutoCapitalize}
      autoCorrect={resolvedAutoCorrect}
      spellCheck={resolvedSpellCheck}
      maxLength={maxLength}
      name={name}
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
