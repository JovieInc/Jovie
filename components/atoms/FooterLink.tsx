'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import { cn } from '@jovie/ui/lib/utils';
import Link from 'next/link';
import React from 'react';

const toneStyles = {
  light: 'text-secondary-token hover:text-primary-token',
  dark: 'text-white/70 hover:text-white',
} as const;

interface FooterLinkProps
  extends Omit<ButtonProps, 'children' | 'variant' | 'size' | 'asChild'> {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof toneStyles;
}

export function FooterLink({
  href,
  children,
  variant = 'dark',
  className,
  ...props
}: FooterLinkProps) {
  const external = /^https?:\/\//.test(href);

  const computedClassName = cn(
    'inline-flex items-center gap-2 h-auto px-0 py-0 text-sm transition-colors',
    toneStyles[variant],
    className
  );

  if (external) {
    return (
      <Button
        asChild
        className={computedClassName}
        size='sm'
        variant='ghost'
        {...props}
      >
        <a href={href} rel='noopener noreferrer' target='_blank'>
          {children}
        </a>
      </Button>
    );
  }

  return (
    <Button
      asChild
      className={computedClassName}
      size='sm'
      variant='ghost'
      {...props}
    >
      <Link href={href}>{children}</Link>
    </Button>
  );
}
