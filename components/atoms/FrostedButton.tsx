'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import { cn } from '@jovie/ui/lib/utils';
import React, { forwardRef } from 'react';

interface FrostedButtonProps
  extends Omit<ButtonProps, 'variant' | 'size' | 'asChild'> {
  shape?: 'default' | 'circle' | 'square';
  variant?: 'default' | 'ghost' | 'outline';
  size?: ButtonProps['size'];
}

const shapeClasses = {
  default: 'rounded-xl',
  circle: 'rounded-full',
  square: 'rounded-none',
} as const;

const frostedVariants: Record<
  NonNullable<FrostedButtonProps['variant']>,
  string
> = {
  default:
    'border-white/40 bg-white/60 text-primary-token shadow-sm backdrop-blur-md hover:bg-white/70 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20',
  ghost:
    'border-white/25 bg-white/30 text-primary-token backdrop-blur-md hover:bg-white/40 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10',
  outline:
    'border-white/50 bg-transparent text-primary-token backdrop-blur-md hover:bg-white/20 dark:border-white/20 dark:text-white dark:hover:bg-white/10',
};

const variantMap: Record<
  NonNullable<FrostedButtonProps['variant']>,
  ButtonProps['variant']
> = {
  default: 'ghost',
  ghost: 'ghost',
  outline: 'outline',
};

/**
 * Button with a frosted glass effect using shadcn primitives.
 */
export const FrostedButton = forwardRef<HTMLButtonElement, FrostedButtonProps>(
  (
    {
      className,
      shape = 'default',
      variant = 'default',
      size = 'default',
      ...props
    },
    ref
  ) => {
    return (
      <Button
        ref={ref}
        variant={variantMap[variant]}
        size={size}
        className={cn(
          'border px-5 py-2 font-medium text-sm transition-colors',
          shapeClasses[shape],
          frostedVariants[variant],
          className
        )}
        {...props}
      />
    );
  }
);

FrostedButton.displayName = 'FrostedButton';
