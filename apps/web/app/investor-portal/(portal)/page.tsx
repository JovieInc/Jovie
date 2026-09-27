import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { InvestorBrief } from '@/components/features/pitch/InvestorBrief';
import { getInvestorPortalAccess } from '@/lib/investors/portal-access';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getInvestorPortalAccess())
      ? 'Jovie — Investors'
      : 'Not Found',
    robots: NOINDEX_ROBOTS,
  };
}

/**
 * Investor portal landing page: the single home of the investor brief.
 * Access (investor link cookie or admin session) is shared with the portal
 * layout through the request-cached gate. The investor name is used solely
 * for the greeting; engagement events never receive the token or identity.
 */
export default async function InvestorLandingPage() {
  const access = await getInvestorPortalAccess();
  if (!access) notFound();

  const investorName = access.kind === 'investor' ? access.investorName : null;

  return <InvestorBrief investorName={investorName} />;
}
