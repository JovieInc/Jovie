'use client';

import { CheckIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';
import React from 'react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface CTAButtonProps extends Omit<ButtonProps, 'loading'> {
  href?: string;
  external?: boolean;
  isLoading?: boolean;
  isSuccess?: boolean;
  icon?: React.ReactNode;
}

/**
 * Call-to-action button built on top of the shared Button component.
 * Supports optional loading and success states for smoother UX.
 */
export function CTAButton({
  href,
  external,
  isLoading,
  isSuccess,
  icon,
  children,
  className,
  ...props
}: CTAButtonProps) {
  const Component = href ? Link : 'button';

  return (
    <Button
      as={Component}
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      loading={isLoading}
      className={cn('gap-2', className)}
      {...props}
    >
      {isSuccess ? (
        <CheckIcon className='h-5 w-5' />
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </Button>
  );
}
