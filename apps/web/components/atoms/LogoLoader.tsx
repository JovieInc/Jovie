import { BrandLogo } from '@/components/atoms/BrandLogo';
import { cn } from '@/lib/utils';

interface LogoLoaderProps {
  readonly size?: number;
  readonly className?: string;
  readonly 'aria-label'?: string;
}

export function LogoLoader({
  size = 32,
  className,
  'aria-label': ariaLabel = 'Loading',
}: LogoLoaderProps) {
  return (
    <output
      aria-live='polite'
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-muted/50 p-2 shadow-sm ring-1 ring-border/60 dark:ring-border/40',
        className
      )}
    >
      <BrandLogo
        size={size}
        tone='muted'
        alt='Jovie logo loading'
        aria-hidden
        className={cn(
          'animate-pulse',
          'motion-reduce:animate-none motion-reduce:transition-none'
        )}
      />
    </output>
  );
}
