import type { Metadata } from 'next';
import { forbidden, redirect, unauthorized } from 'next/navigation';
import { HudDashboardClient } from '@/app/app/(shell)/admin/ops/HudDashboardClient';
import { APP_ROUTES } from '@/constants/routes';
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

function buildInShellOpsHref(params: SearchParams): string {
  const next = new URLSearchParams();
  const ovie = firstString(params.ovie);
  const runtimeParam = firstString(params.runtime);
  const refresh = firstString(params.ovie_refresh);
  const fullscreen =
    firstString(params.fs) === '1' || firstString(params.mode) === 'kiosk';

  if (ovie === 'mac') next.set('ovie', 'mac');
  if (runtimeParam) next.set('runtime', runtimeParam);
  if (refresh) next.set('ovie_refresh', refresh);
  if (fullscreen) next.set('fs', '1');

  const search = next.toString();
  return search ? `${APP_ROUTES.ADMIN_OPS}?${search}` : APP_ROUTES.ADMIN_OPS;
}

/**
 * `/hud` is retained only for token-authenticated TV/kiosk use. Signed-in
 * interactive Ops and packaged Ovie redirect into the shared app shell.
 */
export default async function HudPage({
  searchParams,
}: Readonly<{ readonly searchParams: Promise<SearchParams> }>) {
  const params = await searchParams;
  const kioskToken = firstString(params.kiosk);

  if (!kioskToken) {
    redirect(buildInShellOpsHref(params));
  }

  const tokenAuth = await authorizeHud(kioskToken);
  const tokenOk = tokenAuth.ok === true && tokenAuth.mode === 'kiosk';

  if (!tokenOk) {
    const adminAccess = await getCurrentAdminPageAccess();
    if (!adminAccess.isAuthenticated) unauthorized();
    if (!adminAccess.hasAdminRole) forbidden();
    redirect(`${APP_ROUTES.ADMIN_OPS}?fs=1`);
  }

  const metrics = await getHudMetrics('kiosk');
  return (
    <main className='hud-kiosk-viewport min-h-screen bg-page text-primary-token'>
      <div className='flex flex-col gap-3 p-4'>
        <HudDashboardClient
          initialMetrics={metrics}
          density='kiosk'
          presentationMode='token'
          kioskToken={kioskToken}
          useFixtureAgentRuns={env.HUD_AGENT_RUNS_FIXTURES === '1'}
          initialFunnel={null}
        />
      </div>
    </main>
  );
}
