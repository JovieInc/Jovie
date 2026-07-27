'use client';

import { cn } from '../lib/utils';

export type SpinnerSize = 'sm' | 'md' | 'lg';
export type SpinnerTone = 'primary' | 'muted' | 'inverse';

export type ProgressIndicatorSize = SpinnerSize;
export type ProgressIndicatorTone = SpinnerTone;

export interface ProgressIndicatorProps {
  readonly size?: SpinnerSize;
  readonly tone?: SpinnerTone;
  readonly className?: string;
  readonly label?: string;
}

export type SpinnerProps = ProgressIndicatorProps;

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
 * Compact indeterminate progress for buttons and in-flight actions.
 * Never use inside a page/list skeleton — reserve Skeleton for layout loads.
 */
export function ProgressIndicator({
  size = 'md',
  tone = 'primary',
  className,
  label = 'Loading',
}: ProgressIndicatorProps) {
  return (
    <output
      aria-label={label}
      data-slot='progress-indicator'
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
            'animate-spin will-change-transform',
            'motion-reduce:animate-none motion-reduce:will-change-auto'
          )}
        />
      </span>
    </output>
  );
}

/**
 * @deprecated Use `ProgressIndicator`. Kept as a compatibility alias while
 * action-local callers migrate without a behavior change.
 */
export function Spinner(props: SpinnerProps) {
  return <ProgressIndicator {...props} />;
}
