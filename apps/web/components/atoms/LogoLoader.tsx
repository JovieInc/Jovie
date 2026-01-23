import { BrandLogo } from '@/components/atoms/BrandLogo';
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
  mono: 'opacity-90 dark:opacity-100',
};

export function LogoLoader({
  size = 64,
  variant = 'color',
  className,
  'aria-label': ariaLabel = 'Loading',
}: LogoLoaderProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: output element not appropriate for loading spinner status
    <div
      role='status'
      aria-live='polite'
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-muted/50 p-3 shadow-sm ring-1 ring-border/60 dark:ring-border/40',
        className
      )}
    >
      <BrandLogo
        size={size}
        tone={variant === 'mono' ? 'auto' : 'color'}
        alt='Jovie logo spinner'
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
