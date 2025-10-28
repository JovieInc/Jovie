import { Button, type ButtonProps } from '@jovie/ui';
import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface FrostedButtonProps extends Omit<ButtonProps, 'variant'> {
  shape?: 'default' | 'circle' | 'square';
  frostedStyle?: 'default' | 'ghost' | 'outline';
}

/**
 * @deprecated Use Button with variant="frosted" instead.
 *
 * Migration:
 * - <FrostedButton> → <Button variant="frosted">
 * - frostedStyle="ghost" → variant="frosted-ghost"
 * - frostedStyle="outline" → variant="frosted-outline"
 * - shape="circle" → className="rounded-full"
 * - shape="square" → className="rounded-none"
 *
 * This component will be removed in a future release.
 * Use the automated codemod: `pnpm tsx tools/codemods/migrate-frosted-button.ts`
 *
 * @see packages/ui/atoms/button.tsx for the canonical Button component
 */
export const FrostedButton = forwardRef<HTMLButtonElement, FrostedButtonProps>(
  (
    { className, shape = 'default', frostedStyle = 'default', ...props },
    ref
  ) => {
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
        variant={frostedStyle === 'outline' ? 'outline' : 'ghost'}
        className={cn(
          'border border-gray-200/30 dark:border-white/10',
          variantClasses[frostedStyle],
          shapeClasses[shape],
          className
        )}
        {...props}
      />
    );
  }
);

FrostedButton.displayName = 'FrostedButton';
