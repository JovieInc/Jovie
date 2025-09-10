import Link from 'next/link';
import React from 'react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface NavLinkProps extends Omit<ButtonProps, 'children'> {
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
  prefetch,
  external,
  ...props
}: NavLinkProps) {
  const variantClasses = {
    default:
      'text-sm text-gray-600 dark:text-white/70 hover:text-gray-900 dark:hover:text-white',
    primary: '',
  } as const;

  const common = {
    variant: variant === 'primary' ? 'primary' : 'plain',
    size: 'sm' as const,
    className: cn('h-auto px-0 py-0', variantClasses[variant], className),
    ...props,
  };

  if (external) {
    return (
      <Button
        as='a'
        href={href}
        target='_blank'
        rel='noopener noreferrer'
        {...common}
      >
        {children}
      </Button>
    );
  }

  return (
    <Button as={Link} href={href} prefetch={prefetch} {...common}>
      {children}
    </Button>
  );
}
