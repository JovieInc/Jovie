'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const authButtonVariants = cva(
  'w-full rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0f10]',
  {
    variants: {
      variant: {
        primary:
          'bg-[#e8e8e8] hover:bg-white text-[#101012] font-medium text-sm py-[12px] px-4',
        secondary:
          'border border-white/10 bg-[#17181d] px-4 py-[12px] text-sm font-medium text-[rgb(227,228,230)] hover:bg-[#1e2027]',
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
