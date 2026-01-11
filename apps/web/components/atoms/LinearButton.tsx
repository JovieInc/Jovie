import Link from 'next/link';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface LinearButtonProps
  extends Omit<ComponentPropsWithoutRef<'a'>, 'href'> {
  variant?: 'primary' | 'secondary';
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
        'h-8 px-3 rounded-lg text-sm font-medium bg-transparent text-tertiary-token hover:text-primary-token hover:bg-surface-2',
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
