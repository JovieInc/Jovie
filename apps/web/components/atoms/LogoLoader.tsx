import { JovieO } from '@jovie/ui/brand';
import { type BrandMarkSize, resolveBrandMarkSize } from '@/lib/brand/tokens';
import { cn } from '@/lib/utils';

interface LogoLoaderProps {
  readonly size?: BrandMarkSize;
  readonly className?: string;
  readonly 'aria-label'?: string;
}

/**
 * Page and panel loader: the living O in its loading state (JOV-7760).
 * The live region carries the accessible state; the O itself is decorative,
 * and under reduced motion it holds still.
 */
export function LogoLoader({
  size = 'splash',
  className,
  'aria-label': ariaLabel = 'Loading',
}: LogoLoaderProps) {
  return (
    <output
      aria-live='polite'
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center justify-center text-secondary-token',
        className
      )}
    >
      <JovieO size={resolveBrandMarkSize(size)} state='loading' />
    </output>
  );
}
