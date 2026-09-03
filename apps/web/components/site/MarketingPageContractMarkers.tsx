// @coverage-via apps/web/components/site/PublicPageShell.test.tsx
'use client';

import { usePathname } from 'next/navigation';
import { getMarketingPageContractForPathname } from '@/data/marketing/pageContracts';

export function MarketingPageContractMarkers() {
  const pathname = usePathname();
  const contract = getMarketingPageContractForPathname(pathname);

  if (!contract) return null;

  return (
    <div
      hidden
      aria-hidden='true'
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
