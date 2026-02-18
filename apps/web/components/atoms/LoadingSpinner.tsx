'use client';

import { cn } from '@/lib/utils';

export type LoadingSpinnerTone = 'primary' | 'muted' | 'inverse';

export interface LoadingSpinnerProps {
  readonly size?: 'sm' | 'md' | 'lg';
  readonly tone?: LoadingSpinnerTone;
  readonly className?: string;
  readonly label?: string;
}

const sizeClasses: Record<NonNullable<LoadingSpinnerProps['size']>, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

const toneClasses: Record<LoadingSpinnerTone, string> = {
  primary: 'text-primary-token',
  muted: 'text-muted-foreground',
  inverse: 'text-white',
};

export function LoadingSpinner({
  size = 'md',
  tone = 'primary',
  className,
  label = 'Loading',
}: LoadingSpinnerProps) {
  const dimension = sizeClasses[size];
  const toneClass = toneClasses[tone];

  return (
    <span
      role='status'
      aria-label={label}
      data-testid='spinner'
      data-size={size}
      data-tone={tone}
      className={cn(
        'inline-flex items-center justify-center align-middle text-current',
        'motion-reduce:transition-none',
        dimension,
        toneClass,
        className
      )}
    >
      <span className='relative block h-full w-full' aria-hidden='true'>
        <span
          className={cn(
            'absolute inset-0 rounded-full border-2 border-current/20',
            'transition-transform duration-200 ease-out motion-reduce:transition-none'
          )}
        />
        <span
          className={cn(
            'absolute inset-0 rounded-full border-2 border-current border-t-transparent',
            // Inner span controls the reduced-motion spin timing (slower 1.2s vs normal 1s)
            'animate-spin motion-reduce:animate-[spin_1.2s_linear_infinite]',
            'will-change-transform'
          )}
        />
      </span>
    </span>
  );
}

export const Spinner = LoadingSpinner;
