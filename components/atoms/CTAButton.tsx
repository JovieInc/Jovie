'use client';

import { CheckIcon } from '@heroicons/react/24/solid';
import { Button, type ButtonProps } from '@jovie/ui';
import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';

export interface CTAButtonProps extends Omit<ButtonProps, 'loading' | 'size'> {
  href?: string;
  external?: boolean;
  isLoading?: boolean;
  isSuccess?: boolean;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'default';
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
  size,
  ...props
}: CTAButtonProps) {
  const content = isSuccess ? (
    <CheckIcon className='h-5 w-5' />
  ) : (
    <>
      {icon}
      {children}
    </>
  );
  let mappedSize: ButtonProps['size'];
  if (size === 'md') {
    mappedSize = 'default';
  } else if (size) {
    // props.size may include 'default' | 'sm' | 'lg' | 'icon'
    mappedSize = size as Exclude<CTAButtonProps['size'], 'md'>;
  } else {
    mappedSize = undefined;
  }

  // Determine data-state based on button state priority
  let dataState: string | undefined;
  if (props.disabled) {
    dataState = 'disabled';
  } else if (isLoading) {
    dataState = 'loading';
  } else if (isSuccess) {
    dataState = 'success';
  }

  if (href) {
    return (
      <Button
        asChild
        loading={isLoading}
        size={mappedSize}
        className={cn('gap-2', className)}
        data-state={dataState}
        {...props}
      >
        <Link
          href={href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
        >
          {content}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      loading={isLoading}
      size={mappedSize}
      className={cn('gap-2', className)}
      data-state={dataState}
      {...props}
    >
      {content}
    </Button>
  );
}
