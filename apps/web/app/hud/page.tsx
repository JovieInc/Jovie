import type { Metadata } from 'next';
import { forbidden, unauthorized } from 'next/navigation';
import { HudDashboardClient } from '@/app/app/(shell)/admin/ops/HudDashboardClient';
import { FounderMorningWalkCard } from '@/components/features/admin/hud/FounderMorningWalkCard';
import { HudFullscreenButton } from '@/components/features/admin/hud/HudFullscreenButton';
import { HudShipperPanels } from '@/components/features/admin/hud/HudShipperPanels';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { getCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { authorizeHud } from '@/lib/auth/hud';
import { env } from '@/lib/env-server';
import { getHudMetrics } from '@/lib/hud/metrics';
import { isHudMetricValueAvailable } from '@/lib/hud/source-trust';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Ovie',
  description: 'One operator HUD.',
  robots: NOINDEX_ROBOTS,
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstString(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });
}

/**
 * Ovie is one screen: /hud.
 * ?fs=1 is fullscreen for a signed-in admin.
 * ?kiosk=TOKEN is the unattended TV path.
 */
export default async function HudPage({
  searchParams,
}: Readonly<{ readonly searchParams: Promise<SearchParams> }>) {
  const params = await searchParams;
  const kioskToken = firstString(params.kiosk);
  const fullscreen =
    firstString(params.fs) === '1' || firstString(params.mode) === 'kiosk';

  const tokenAuth = kioskToken ? await authorizeHud(kioskToken) : null;
  const tokenOk = tokenAuth?.ok === true && tokenAuth.mode === 'kiosk';

  if (kioskToken && !tokenOk) {
    const adminAccess = await getCurrentAdminPageAccess();
    if (!adminAccess.isAuthenticated) unauthorized();
    if (!adminAccess.hasAdminRole) forbidden();
  } else if (!tokenOk) {
    const adminAccess = await getCurrentAdminPageAccess();
    if (!adminAccess.isAuthenticated) unauthorized();
    if (!adminAccess.hasAdminRole) forbidden();
  }

  const metrics = await getHudMetrics(tokenOk ? 'kiosk' : 'admin');
  const walk = (
    <FounderMorningWalkCard
      mrrLabel={
        isHudMetricValueAvailable(metrics.sources.stripe)
          ? formatUsd(metrics.overview.mrrUsd)
          : '—'
      }
      cashLabel={
        isHudMetricValueAvailable(metrics.sources.mercury)
          ? formatUsd(metrics.overview.balanceUsd)
          : '—'
      }
      defaultStatus={metrics.overview.defaultStatusDetail}
    />
  );

  const dashboard = (
    <HudDashboardClient
      initialMetrics={metrics}
      density={tokenOk || fullscreen ? 'kiosk' : 'shell'}
      presentationMode={tokenOk ? 'token' : 'shell'}
      kioskToken={tokenOk ? kioskToken : null}
      useFixtureAgentRuns={env.HUD_AGENT_RUNS_FIXTURES === '1'}
    />
  );

  if (tokenOk || fullscreen) {
    return (
      <main className='hud-kiosk-viewport min-h-screen bg-page text-primary-token'>
        <div className='flex flex-col gap-3 p-4'>
          {walk}
          {tokenOk ? null : <HudShipperPanels />}
          {dashboard}
        </div>
      </main>
    );
  }

  return (
    <StandaloneProductPage width='xl' className='hud-admin-viewport'>
      <AdminPage
        title='Ovie'
        description='Need, then noise.'
        testId='hud-admin-page'
        actions={<HudFullscreenButton />}
      >
        {walk}
        <HudShipperPanels />
        {dashboard}
      </AdminPage>
    </StandaloneProductPage>
  );
}
