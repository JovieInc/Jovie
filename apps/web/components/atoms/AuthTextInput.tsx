'use client';

import { Input } from '@jovie/ui';
import * as React from 'react';
import {
  AUTH_TEXT_INPUT_BASE_CLASS,
  AUTH_TEXT_INPUT_VARIANT_CLASS,
} from '@/components/atoms/auth-text-input-styles';
import { cn } from '@/lib/utils';

type AuthTextInputVariant = 'default' | 'otp';

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
      className={cn(
        AUTH_TEXT_INPUT_BASE_CLASS,
        AUTH_TEXT_INPUT_VARIANT_CLASS[variant],
        className
      )}
      {...props}
    />
  );
});

AuthTextInput.displayName = 'AuthTextInput';
