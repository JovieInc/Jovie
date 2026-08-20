import type { Metadata } from 'next';
import { forbidden, unauthorized } from 'next/navigation';
import { HudDashboardClient } from '@/app/app/(shell)/admin/ops/HudDashboardClient';
import { HudFullscreenControl } from '@/components/features/admin/hud/HudFullscreenControl';
import { HudNoiseDisclosure } from '@/components/features/admin/hud/HudNoiseDisclosure';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { OperationalControlPanel } from '@/components/features/admin/OperationalControlPanel';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { getFounderFunnelData } from '@/lib/admin/founder-funnel';
import { getCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { authorizeHud } from '@/lib/auth/hud';
import { env } from '@/lib/env-server';
import { getHudMetrics } from '@/lib/hud/metrics';
import { OVIE_OPS_PRODUCT_NAME } from '@/lib/ovie/ops-entrypoint';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: OVIE_OPS_PRODUCT_NAME,
  description: 'Scan-first company operations.',
  robots: NOINDEX_ROBOTS,
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstString(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Canonical Ops screen: /hud.
 * ?fs=1 is fullscreen for a signed-in admin.
 * ?kiosk=TOKEN is the unattended TV path.
 * Both are presentation modes of HudDashboardClient, not separate products.
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

  const [metrics, funnel] = await Promise.all([
    getHudMetrics(tokenOk ? 'kiosk' : 'admin'),
    tokenOk
      ? Promise.resolve(null)
      : getFounderFunnelData('30d').catch(() => null),
  ]);
  const dashboard = (
    <HudDashboardClient
      initialMetrics={metrics}
      density={tokenOk || fullscreen ? 'kiosk' : 'shell'}
      presentationMode={tokenOk ? 'token' : 'shell'}
      kioskToken={tokenOk ? kioskToken : null}
      useFixtureAgentRuns={env.HUD_AGENT_RUNS_FIXTURES === '1'}
      initialFunnel={funnel}
    />
  );

  if (tokenOk || fullscreen) {
    return (
      <main className='hud-kiosk-viewport min-h-screen bg-page text-primary-token'>
        <div className='flex flex-col gap-3 p-4'>{dashboard}</div>
      </main>
    );
  }

  return (
    <StandaloneProductPage width='xl' className='hud-admin-viewport'>
      <AdminPage
        title={OVIE_OPS_PRODUCT_NAME}
        description='Decisions, survival, bottleneck, delivery, operating chain.'
        testId='hud-admin-page'
        actions={<HudFullscreenControl />}
      >
        {dashboard}
        <HudNoiseDisclosure id='developer-controls' label='Developer Controls'>
          <OperationalControlPanel />
        </HudNoiseDisclosure>
      </AdminPage>
    </StandaloneProductPage>
  );
}
