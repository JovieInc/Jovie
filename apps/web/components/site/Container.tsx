import { cn } from '@/lib/utils';

interface ContainerProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'homepage';
}

/**
 * Container size -> Tailwind max-width class.
 *
 * As of DS_FOUNDATION_V1 (Wave 1a), `lg`, `xl`, and `homepage` all resolve to
 * the canonical public-content max width (`--ds-public-content-max`, 1298px)
 * via `max-w-public-content`.
 *
 * `sm` and `md` are retained for source compatibility with existing
 * call-sites and are slated for removal in Wave 4.
 *
 * `full` (no max width) is unchanged.
 */
const containerSizes = {
  /** @deprecated Use the default size (`'lg'`) which resolves to the canonical 1298px width, or migrate to a layout primitive. Will be removed in DS_FOUNDATION_V1 Wave 4. */
  sm: 'max-w-3xl',
  /** @deprecated Use the default size (`'lg'`) which resolves to the canonical 1298px width, or migrate to a layout primitive. Will be removed in DS_FOUNDATION_V1 Wave 4. */
  md: 'max-w-5xl',
  lg: 'max-w-public-content',
  /** @deprecated Use `'lg'` (the default). `xl` is now an alias of the canonical 1298px width and will be removed in DS_FOUNDATION_V1 Wave 4. */
  xl: 'max-w-public-content',
  full: 'max-w-none',
  /** @deprecated Use `'lg'` (the default). `homepage` is now an alias of the canonical 1298px width and will be removed in DS_FOUNDATION_V1 Wave 4. */
  homepage: 'max-w-public-content',
};

export function Container({
  children,
  className,
  size = 'lg',
}: ContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto px-5 sm:px-6 lg:px-8',
        containerSizes[size],
        className
      )}
    >
      {children}
    </div>
  );
}
