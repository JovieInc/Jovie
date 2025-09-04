import { cn } from '@/lib/utils';

export type ControlVariant = 'subtle' | 'neutral';
export type ControlSize = 'sm' | 'md';

export function controlClasses({
  variant = 'subtle',
  size = 'sm',
  className,
}: {
  variant?: ControlVariant;
  size?: ControlSize;
  className?: string;
}) {
  return cn(
    'inline-flex items-center justify-center rounded-md transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
    'border border-subtle',
    variant === 'subtle'
      ? 'bg-surface-2 hover:bg-surface-3 text-tertiary-token hover:text-secondary-token'
      : 'bg-surface-1 hover:bg-surface-2 text-secondary-token hover:text-primary-token',
    size === 'sm' ? 'h-8' : 'h-9',
    className
  );
}
