import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { investorSettings } from '@/lib/db/schema/investors';
import { getInvestorManifest } from '@/lib/investors/manifest';
import { getInvestorPortalAccess } from '@/lib/investors/portal-access';
import {
  loadInvestorSourcedMetrics,
  sourcedUsdAmount,
} from '@/lib/investors/sourced-metrics';
import { InvestorNav } from '../_components/InvestorNav';
import { InvestorStickyBar } from '../_components/InvestorStickyBar';

/**
 * Investor portal layout.
 * Dark mode only. No marketing header/footer.
 * Left sidebar nav + bottom sticky action bar.
 *
 * proxy.ts turns away requests with neither an investor cookie nor a session;
 * this layout is the authoritative gate (active investor link or admin) and
 * renders a neutral 404 before any portal data is read.
 */
export default async function InvestorLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const access = await getInvestorPortalAccess();
  if (!access) notFound();

  const investorName = access.kind === 'investor' ? access.investorName : null;

  // Fetch portal settings and manifest in parallel
  const [settingsResult, manifest] = await Promise.all([
    db.select().from(investorSettings).limit(1),
    getInvestorManifest(),
  ]);
  const settings = settingsResult[0];
  const metrics = loadInvestorSourcedMetrics();
  const sourcedRaiseTarget = sourcedUsdAmount(metrics, 'raise_target_usd');
  const sourcedCommitted = sourcedUsdAmount(metrics, 'raise_committed_usd');
  const navPages = manifest.pages
    .filter(p => p.nav)
    .map(p => ({ slug: p.slug, title: p.title }));

  return (
    <div className='dark min-h-screen bg-base text-primary-token'>
      <div className='flex min-h-screen'>
        {/* Left sidebar nav — 200px fixed on desktop */}
        <InvestorNav investorName={investorName} pages={navPages} />

        {/* Main content area */}
        <main className='flex-1 pb-20 pt-14 lg:pb-24 lg:pt-0'>{children}</main>
      </div>

      {/* Bottom sticky action bar */}
      <InvestorStickyBar
        investUrl={settings?.investUrl ?? null}
        showProgress={
          (settings?.showProgressBar ?? false) && sourcedRaiseTarget !== null
        }
        raiseTarget={sourcedRaiseTarget}
        committedAmount={sourcedCommitted}
        investorCount={null}
      />
    </div>
  );
}
