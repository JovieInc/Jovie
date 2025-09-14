import Link from 'next/link';
import React from 'react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface NavLinkProps extends Omit<ButtonProps, 'children' | 'variant'> {
  href: string;
  children: React.ReactNode;
  variant?: 'default' | 'primary';
  prefetch?: boolean;
  external?: boolean;
}

/**
 * Navigation link built on the shared Button component for consistent theming.
 */
export function NavLink({
  href,
  children,
  className,
  variant = 'default',
  external,
  ...props
}: NavLinkProps) {
  const variantClasses = {
    default:
      'text-sm text-gray-600 dark:text-white/70 hover:text-gray-900 dark:hover:text-white',
    primary: '',
  } as const;

  const computedClassName = cn(
    'h-auto px-0 py-0',
    variantClasses[variant],
    className
  );

  if (external) {
    return (
      <Button
        as='a'
        href={href}
        target='_blank'
        rel='noopener noreferrer'
        variant={variant === 'primary' ? 'primary' : 'plain'}
        size='sm'
        className={computedClassName}
        {...props}
      >
        {children}
      </Button>
    );
  }

  return (
    <Button
      as={Link}
      href={href}
      variant={variant === 'primary' ? 'primary' : 'plain'}
      size='sm'
      className={computedClassName}
      {...props}
    >
      {children}
    </Button>
  );
}
