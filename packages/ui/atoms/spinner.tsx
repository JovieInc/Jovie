'use client';

import * as React from 'react';

import { cn } from '../lib/utils';

export type SpinnerSize = 'sm' | 'md' | 'lg';
export type SpinnerTone = 'primary' | 'muted' | 'inverse';

export interface SpinnerProps {
  readonly size?: SpinnerSize;
  readonly tone?: SpinnerTone;
  readonly className?: string;
  readonly label?: string;
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

const toneClasses: Record<SpinnerTone, string> = {
  primary: 'text-primary-token',
  muted: 'text-muted-foreground',
  inverse: 'text-white',
};

/**
 * Inline spinner for buttons and in-flight actions.
 * Never use inside a page/list skeleton — reserve Skeleton for layout loads.
 */
export function Spinner({
  size = 'md',
  tone = 'primary',
  className,
  label = 'Loading',
}: SpinnerProps) {
  return (
    <output
      aria-label={label}
      data-testid='spinner'
      data-size={size}
      data-tone={tone}
      className={cn(
        'inline-flex items-center justify-center align-middle text-current',
        'motion-reduce:transition-none',
        sizeClasses[size],
        toneClasses[tone],
        className
      )}
    >
      <span className='relative block h-full w-full' aria-hidden='true'>
        <span
          className={cn(
            'absolute inset-0 rounded-full border-2 border-current/20',
            'transition-transform duration-subtle ease-out motion-reduce:transition-none'
          )}
        />
        <span
          className={cn(
            'absolute inset-0 rounded-full border-2 border-current border-t-transparent',
            'animate-spin motion-reduce:animate-[spin_1.2s_linear_infinite]',
            'will-change-transform'
          )}
        />
      </span>
    </output>
  );
}