import { cn } from '@/lib/utils';
import { MarketingContainer } from './MarketingContainer';

export interface MarketingContentShellProps {
  readonly className?: string;
  readonly children: React.ReactNode;
}

/**
 * Content page shell for long-form marketing pages (privacy, terms, about, etc.).
 *
 * Wraps children in a prose-width container with marketing typography defaults
 * and consistent vertical padding.
 */
export function MarketingContentShell({
  className,
  children,
}: MarketingContentShellProps) {
  return (
    <div className='py-16 sm:py-20 lg:py-24'>
      <MarketingContainer width='prose'>
        <div
          className={cn(
            'marketing-body',
            'text-[var(--linear-text-secondary)]',
            className
          )}
        >
          {children}
        </div>
      </MarketingContainer>
    </div>
  );
}
