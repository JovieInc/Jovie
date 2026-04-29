import { cn } from '@/lib/utils';

const widthClasses = {
  landing: 'max-w-[1280px]',
  page: 'max-w-[1200px]',
  prose: 'max-w-[680px]',
} as const;

export interface MarketingContainerProps {
  readonly width: 'landing' | 'page' | 'prose';
  readonly className?: string;
  readonly children: React.ReactNode;
}

/**
 * Centered container with responsive horizontal padding.
 * Uses shared public marketing max-width tokens for consistent page widths.
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
