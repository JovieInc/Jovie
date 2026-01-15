import Link from 'next/link';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface LinearButtonProps
  extends Omit<ComponentPropsWithoutRef<'a'>, 'href'> {
  variant?: 'primary' | 'secondary' | 'ghost';
  href: string;
  children: React.ReactNode;
}

export const LinearButton = forwardRef<HTMLAnchorElement, LinearButtonProps>(
  ({ variant = 'primary', href, children, className, ...props }, ref) => {
    const baseStyles =
      'focus-ring-themed inline-flex items-center justify-center transition-all';
    const variantStyles = {
      primary: 'btn-linear-primary',
      secondary:
        'h-10 px-4 rounded-lg text-sm font-medium bg-transparent text-secondary-token hover:text-primary-token hover:bg-surface-1 border border-transparent hover:border-subtle duration-150',
      ghost:
        'h-10 px-0 gap-1.5 text-sm font-medium text-secondary-token hover:text-primary-token duration-150',
    };

    return (
      <Link
        ref={ref}
        href={href}
        className={cn(baseStyles, variantStyles[variant], className)}
        {...props}
      >
        {children}
      </Link>
    );
  }
);

LinearButton.displayName = 'LinearButton';
