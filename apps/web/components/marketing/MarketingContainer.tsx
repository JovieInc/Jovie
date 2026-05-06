import { cn } from '@/lib/utils';

/**
 * Width variant -> Tailwind max-width class.
 *
 * As of DS_FOUNDATION_V1 (Wave 1a), `landing` and `page` both resolve to the
 * canonical public-content max width (`--ds-public-content-max`, 1298px) via
 * `max-w-public-content`. The legacy variant names are retained as
 * call-site-compatible aliases and will be swept by Wave 1d/4.
 *
 * `prose` continues to use the canonical prose max width
 * (`--ds-prose-max`, 680px) via `max-w-prose-canonical`.
 */
const widthClasses = {
  /** @deprecated Use `'page'`. `landing` remains as a source-compatible alias until DS_FOUNDATION_V1 Wave 4. */
  landing: 'max-w-public-content',
  page: 'max-w-public-content',
  prose: 'max-w-prose-canonical',
} as const;

export interface MarketingContainerProps {
  readonly width: 'landing' | 'page' | 'prose';
  readonly className?: string;
  readonly children: React.ReactNode;
}

/**
 * Centered container with responsive horizontal padding.
 *
 * Uses the canonical DS_FOUNDATION_V1 max-width tokens for consistent page
 * widths across marketing surfaces.
 */
export function MarketingContainer({
  width,
  className,
  children,
}: MarketingContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-6 sm:px-8 lg:px-10',
        widthClasses[width],
        className
      )}
    >
      {children}
    </div>
  );
}
