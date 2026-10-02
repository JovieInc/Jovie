import type { Metadata } from 'next';
import { forbidden, redirect, unauthorized } from 'next/navigation';
import { HudDashboardClient } from '@/app/app/(shell)/admin/ops/HudDashboardClient';
import { HudFullscreenControl } from '@/components/features/admin/hud/HudFullscreenControl';
import { HudNoiseDisclosure } from '@/components/features/admin/hud/HudNoiseDisclosure';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { OperationalControlPanel } from '@/components/features/admin/OperationalControlPanel';
import { APP_ROUTES } from '@/constants/routes';
import { getFounderFunnelData } from '@/lib/admin/founder-funnel';
import { getCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { AGENT_OS_ADMIN_FIXTURE_ARTIFACTS } from '@/lib/agent-os/fixtures';
import { authorizeHud } from '@/lib/auth/hud';
import { env } from '@/lib/env-server';
import { getHudMetrics } from '@/lib/hud/metrics';
import { OVIE_OPS_PRODUCT_NAME } from '@/lib/ovie/ops-entrypoint';
import { assertOviePrivacyUnlocked } from '@/lib/ovie/privacy-lock/server';
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
 * Default /hud is rewritten into the OV app shell. A valid kiosk token is the
 * only presentation boundary; browser fullscreen expands the current shell.
 */
export default async function HudPage({
  searchParams,
}: Readonly<{ readonly searchParams: Promise<SearchParams> }>) {
  const params = await searchParams;
  const kioskToken = firstString(params.kiosk);
  const requestedKiosk = Boolean(
    kioskToken || firstString(params.mode) === 'kiosk'
  );

  const tokenAuth = kioskToken ? await authorizeHud(kioskToken) : null;
  const tokenOk = tokenAuth?.ok === true && tokenAuth.mode === 'kiosk';

  if (!tokenOk) {
    const adminAccess = await getCurrentAdminPageAccess();
    if (adminAccess.hasAdminRole) await assertOviePrivacyUnlocked();
    if (!adminAccess.isAuthenticated) unauthorized();
    if (!adminAccess.hasAdminRole) forbidden();
    if (requestedKiosk) redirect(APP_ROUTES.HUD);
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
      density={tokenOk ? 'kiosk' : 'shell'}
      presentationMode={tokenOk ? 'token' : 'shell'}
      kioskToken={tokenOk ? kioskToken : null}
      initialFixtureAgentRuns={
        env.HUD_AGENT_RUNS_FIXTURES === '1'
          ? AGENT_OS_ADMIN_FIXTURE_ARTIFACTS
          : undefined
      }
      initialFunnel={funnel}
    />
  );

  if (tokenOk) {
    return (
      <main className='hud-kiosk-viewport min-h-screen bg-page text-primary-token'>
        <div className='flex flex-col gap-3 p-4'>{dashboard}</div>
      </main>
    );
  }

  return (
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
  );
}
