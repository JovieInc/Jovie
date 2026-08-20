import type { Metadata } from 'next';
import { forbidden, unauthorized } from 'next/navigation';
import { HudDashboardClient } from '@/app/app/(shell)/admin/ops/HudDashboardClient';
import { HudFullscreenControl } from '@/components/features/admin/hud/HudFullscreenControl';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { OperationalControlPanel } from '@/components/features/admin/OperationalControlPanel';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { getCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { authorizeHud } from '@/lib/auth/hud';
import { env } from '@/lib/env-server';
import { getHudMetrics } from '@/lib/hud/metrics';
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
        <div className='flex flex-col gap-3 p-4'>{dashboard}</div>
      </main>
    );
  }

  return (
    <StandaloneProductPage width='xl' className='hud-admin-viewport'>
      <AdminPage
        title='Ovie'
        description='Need, then noise.'
        testId='hud-admin-page'
        actions={<HudFullscreenControl />}
      >
        {dashboard}
        <OperationalControlPanel />
      </AdminPage>
    </StandaloneProductPage>
  );
}
