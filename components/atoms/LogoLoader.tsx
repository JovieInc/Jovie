import Image from 'next/image';
import { cn } from '@/lib/utils';

type LogoLoaderVariant = 'color' | 'mono';

interface LogoLoaderProps {
  size?: number;
  variant?: LogoLoaderVariant;
  className?: string;
  'aria-label'?: string;
}

const VARIANT_CLASSES: Record<LogoLoaderVariant, string> = {
  color: 'filter-none',
  mono: 'grayscale saturate-0 opacity-90 dark:opacity-100 dark:invert dark:brightness-200 dark:contrast-125',
};

export function LogoLoader({
  size = 64,
  variant = 'color',
  className,
  'aria-label': ariaLabel = 'Loading',
}: LogoLoaderProps) {
  return (
    <div
      role='status'
      aria-live='polite'
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-muted/50 p-3 shadow-sm ring-1 ring-border/60 dark:ring-border/40',
        className
      )}
    >
      <Image
        src='/brand/Jovie-Logo-Icon.svg'
        alt='Jovie logo spinner'
        width={size}
        height={size}
        priority
        className={cn(
          'animate-spin',
          'motion-reduce:animate-none motion-reduce:transition-none',
          VARIANT_CLASSES[variant]
        )}
        style={{ animationDuration: '1.25s' }}
      />
    </div>
  );
}
