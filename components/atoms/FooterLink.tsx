import { Button, type ButtonProps } from '@jovie/ui';
import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';

const variantStyles = {
  light:
    'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white',
  dark: 'text-white/60 hover:text-white',
} as const;

interface FooterLinkProps extends Omit<ButtonProps, 'children' | 'variant'> {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof variantStyles;
}

export function FooterLink({
  href,
  children,
  variant = 'dark',
  className,
  ...props
}: FooterLinkProps) {
  const external = /^https?:\/\//.test(href);
  const common = {
    variant: 'ghost' as const,
    size: 'sm' as const,
    className: cn(
      'h-auto px-0 py-0 transition-colors',
      variantStyles[variant],
      className
    ),
    ...props,
  };

  if (external) {
    return (
      <Button asChild {...common}>
        <a href={href} target='_blank' rel='noopener noreferrer'>
          {children}
        </a>
      </Button>
    );
  }

  return (
    <Button asChild {...common}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}
