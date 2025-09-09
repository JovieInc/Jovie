import React, { forwardRef } from 'react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface FrostedButtonProps extends ButtonProps {
  shape?: 'default' | 'circle' | 'square';
  variant?: 'default' | 'ghost' | 'outline';
}

/**
 * Button with a frosted glass effect built on the shared Button component.
 */
export const FrostedButton = forwardRef<HTMLButtonElement, FrostedButtonProps>(
  ({ className, shape = 'default', variant = 'default', ...props }, ref) => {
    const shapeClasses = {
      default: 'rounded-lg',
      circle: 'rounded-full',
      square: 'rounded-none',
    } as const;

    const variantClasses = {
      default:
        'backdrop-blur-sm bg-white/60 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20',
      ghost:
        'backdrop-blur-sm bg-white/30 dark:bg-white/5 hover:bg-white/50 dark:hover:bg-white/10',
      outline:
        'backdrop-blur-sm bg-transparent border border-gray-200/30 dark:border-white/10 hover:bg-white/20 dark:hover:bg-white/5',
    } as const;

    return (
      <Button
        ref={ref}
        variant='ghost'
        className={cn(
          'border border-gray-200/30 dark:border-white/10',
          variantClasses[variant],
          shapeClasses[shape],
          className
        )}
        {...props}
      />
    );
  }
);

FrostedButton.displayName = 'FrostedButton';
