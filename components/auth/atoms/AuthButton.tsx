'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const authButtonVariants = cva(
  'w-full rounded-lg transition-colors flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0f10]',
  {
    variants: {
      variant: {
        primary:
          'border border-white/10 bg-[#1e2025] px-4 py-[11px] text-[14px] leading-5 font-medium text-[rgb(227,228,230)] hover:bg-[#23262d] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
        primaryLight:
          'bg-[#e8e8e8] hover:bg-white text-[#101012] font-medium text-[14px] leading-5 py-[11px] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.20)]',
        oauthPrimary:
          'bg-[#5b5ce6] hover:bg-[#6667ff] text-white font-medium text-[14px] leading-5 py-[11px] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]',
        secondary:
          'border border-white/10 bg-[#1e2025] px-4 py-[11px] text-[14px] leading-5 font-medium text-[rgb(227,228,230)] hover:bg-[#23262d] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
        link: 'bg-transparent p-0 text-sm text-secondary hover:text-white',
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
