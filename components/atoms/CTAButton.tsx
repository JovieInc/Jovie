'use client';

import { CheckIcon } from '@heroicons/react/24/solid';
import { Button, type ButtonProps } from '@jovie/ui';
import { cn } from '@jovie/ui/lib/utils';
import Link from 'next/link';
import React from 'react';

const sizeMap = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
} as const;

export interface CTAButtonProps
  extends Omit<ButtonProps, 'asChild' | 'loading' | 'size'> {
  href?: string;
  external?: boolean;
  isLoading?: boolean;
  isSuccess?: boolean;
  icon?: React.ReactNode;
  size?: keyof typeof sizeMap;
  prefetch?: boolean;
}

/**
 * Call-to-action button built on top of the shared Button component.
 * Supports optional loading and success states for smoother UX.
 */
export function CTAButton({
  href,
  external,
  isLoading = false,
  isSuccess = false,
  icon,
  children,
  className,
  size = 'md',
  prefetch,
  disabled,
  ...props
}: CTAButtonProps) {
  const resolvedSize = sizeMap[size] ?? 'default';

  const content = isSuccess ? (
    <span className='flex items-center justify-center'>
      <CheckIcon aria-hidden className='h-5 w-5' />
      <span className='sr-only'>Action completed</span>
    </span>
  ) : (
    <span className='inline-flex items-center gap-2'>
      {icon}
      <span className='whitespace-nowrap'>{children}</span>
    </span>
  );

  const commonProps: Partial<ButtonProps> = {
    size: resolvedSize,
    loading: isLoading,
    className: cn('gap-2', className),
    'data-state': isSuccess ? 'success' : undefined,
    disabled,
    ...props,
  };

  if (href) {
    const linkContent = external ? (
      <a href={href} rel='noopener noreferrer' target='_blank'>
        {content}
      </a>
    ) : (
      <Link href={href} prefetch={prefetch}>
        {content}
      </Link>
    );

    return (
      <Button asChild {...commonProps}>
        {linkContent}
      </Button>
    );
  }

  return <Button {...commonProps}>{content}</Button>;
}
