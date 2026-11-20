// @coverage-via apps/web/components/site/PublicPageShell.test.tsx
'use client';

import {
  getMarketingPageContractForPathname,
  type MarketingPageContract,
} from '@/data/marketing/pageContracts';
import { usePublicPathname } from '@/lib/navigation/use-public-pathname';

interface MarketingPageContractMarkersProps {
  /**
   * A page record's own contract, passed by its family route. Without it, a
   * family glob contract renders nothing: the record route owns its markers.
   */
  readonly contract?: MarketingPageContract;
}

export function MarketingPageContractMarkers({
  contract: recordContract,
}: MarketingPageContractMarkersProps = {}) {
  const pathname = usePublicPathname();
  const contract =
    recordContract ?? getMarketingPageContractForPathname(pathname);

  if (!contract || (!recordContract && contract.recordFamily)) return null;

  return (
    <div
      hidden
      aria-hidden='true'
      data-copy-scope={contract.copyScope}
      data-page-job={contract.job}
      data-proof={contract.proof}
      data-success-event={contract.successEvent}
    >
      <a href={contract.primaryCta.href} data-primary-cta='true'>
        {contract.primaryCta.label}
      </a>
    </div>
  );
}
