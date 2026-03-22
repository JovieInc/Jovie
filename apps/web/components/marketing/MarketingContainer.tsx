import { cn } from '@/lib/utils';

const widthClasses = {
  landing: 'max-w-[1344px]',
  page: 'max-w-[1024px]',
  prose: 'max-w-[624px]',
} as const;

export interface MarketingContainerProps {
  readonly width: 'landing' | 'page' | 'prose';
  readonly className?: string;
  readonly children: React.ReactNode;
}

/**
 * Centered container with responsive horizontal padding.
 * Uses the Linear-derived max-width tokens for consistent page widths.
 */
export function MarketingContainer({
  width,
  className,
  children,
}: MarketingContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-5 sm:px-6 lg:px-8',
        widthClasses[width],
        className
      )}
    >
      {children}
    </div>
  );
}
