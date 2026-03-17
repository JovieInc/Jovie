'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import { Check } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

export interface CTAButtonProps extends Omit<ButtonProps, 'loading' | 'size'> {
  readonly href?: string;
  readonly external?: boolean;
  readonly icon?: React.ReactNode;
  readonly isLoading?: boolean;
  readonly isSuccess?: boolean;
  readonly size?: 'sm' | 'md' | 'lg' | 'icon' | 'default';
  readonly prefetch?: boolean;
}

// Helper to compute data-state attribute
function getDataState(
  isLoading: boolean | undefined,
  isSuccess: boolean | undefined,
  disabled: boolean | undefined
): string {
  if (isLoading) return 'loading';
  if (isSuccess) return 'success';
  if (disabled) return 'disabled';
  return 'idle';
}

// Helper to render the icon based on state
function renderStateIcon(
  isLoading: boolean | undefined,
  isSuccess: boolean | undefined,
  icon: React.ReactNode
): React.ReactNode {
  if (isLoading) return <LoadingSpinner size='sm' tone='inverse' />;
  if (isSuccess) return <Check aria-hidden className='h-4 w-4' />;
  return icon;
}

export const CTAButton = React.forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  CTAButtonProps
>(
  (
    {
      href,
      external,
      icon,
      isLoading,
      isSuccess,
      size,
      children,
      className,
      prefetch,
      ...props
    },
    ref
  ) => {
    const prefersReducedMotion = useReducedMotion();

    const mappedSize: ButtonProps['size'] | undefined =
      size === 'md' ? 'default' : size;

    const isDisabled = props.disabled || isLoading;
    const dataState = getDataState(isLoading, isSuccess, props.disabled);

    const content = (
      <span className='inline-flex items-center gap-2'>
        {renderStateIcon(isLoading, isSuccess, icon)}
        <span className={cn(isLoading && 'opacity-80')}>{children}</span>
      </span>
    );

    const sharedClassName = cn(
      'gap-2 rounded-lg transition-all duration-150 ease-out',
      'active:translate-y-[1px] focus-visible:translate-y-[0.5px]',
      'motion-reduce:transition-none motion-reduce:transform-none',
      'will-change-transform focus-visible:ring-offset-2 focus-visible:ring-ring focus-visible:ring-offset-background',
      prefersReducedMotion
        ? 'shadow-none active:translate-y-0 hover:shadow-none'
        : 'shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]',
      className
    );

    if (href) {
      return (
        <Button
          asChild
          disabled={isDisabled}
          size={mappedSize}
          data-state={dataState}
          data-reduced-motion={prefersReducedMotion ? 'true' : undefined}
          className={sharedClassName}
          aria-busy={isLoading || undefined}
          {...props}
        >
          <Link
            ref={ref as React.Ref<HTMLAnchorElement>}
            href={href}
            prefetch={prefetch}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
            aria-live={isSuccess ? 'polite' : undefined}
          >
            {content}
          </Link>
        </Button>
      );
    }

    return (
      <Button
        ref={ref as React.Ref<HTMLButtonElement>}
        disabled={isDisabled}
        size={mappedSize}
        data-state={dataState}
        data-reduced-motion={prefersReducedMotion ? 'true' : undefined}
        className={sharedClassName}
        aria-live={isSuccess ? 'polite' : undefined}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {content}
      </Button>
    );
  }
);

CTAButton.displayName = 'CTAButton';
