import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { cn } from '@/lib/utils';
import { MarketingContainer } from './MarketingContainer';

export interface MarketingContentShellProps {
  readonly className?: string;
  readonly children: React.ReactNode;
  /** Directories retain the public grid; reading surfaces use prose. */
  readonly width?: 'page' | 'prose';
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
  width = 'prose',
}: MarketingContentShellProps) {
  return (
    <div
      className='bg-base py-16 text-primary-token sm:py-20 lg:py-24'
      data-public-content-shell
      data-public-content-width={width}
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.shell.prose}
    >
      <MarketingContainer width={width}>
        <div
          className={cn(
            'marketing-body',
            'min-w-0 text-secondary-token',
            className
          )}
        >
          {children}
        </div>
      </MarketingContainer>
    </div>
  );
}
