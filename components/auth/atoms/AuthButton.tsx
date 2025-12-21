'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const authButtonVariants = cva(
  'w-full h-12 rounded-lg transition-colors flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed focus-ring-themed focus-visible:ring-offset-(--color-bg-base)',
  {
    variants: {
      variant: {
        primary:
          'bg-btn-primary px-4 text-[15px] leading-5 font-medium text-btn-primary-foreground shadow-(--shadow-sm) hover:opacity-90',
        primaryLight:
          'border border-subtle bg-surface-0 px-4 text-[15px] leading-5 font-medium text-primary-token shadow-(--shadow-sm) hover:bg-surface-1',
        oauthPrimary:
          'bg-btn-primary px-4 text-[15px] leading-5 font-medium text-btn-primary-foreground shadow-(--shadow-sm) hover:opacity-90',
        secondary:
          'border border-subtle bg-surface-0 px-4 text-[15px] leading-5 font-medium text-primary-token shadow-(--shadow-sm) hover:bg-surface-1',
        link: 'bg-transparent p-0 text-sm text-secondary-token hover:text-primary-token',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  }
);

export interface AuthButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof authButtonVariants> {}

export const AuthButton = React.forwardRef<HTMLButtonElement, AuthButtonProps>(
  ({ className, variant, type, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={cn(authButtonVariants({ variant }), className)}
        {...props}
      />
    );
  }
);

AuthButton.displayName = 'AuthButton';

export { authButtonVariants };
