import type { Metadata } from 'next';
import { forbidden, unauthorized } from 'next/navigation';
import { OpsCockpitClient } from '@/app/app/(shell)/admin/ops/OpsCockpitClient';
import { HudFullscreenControl } from '@/components/features/admin/hud/HudFullscreenControl';
import { HudNoiseDisclosure } from '@/components/features/admin/hud/HudNoiseDisclosure';
import { OvieMacHud } from '@/components/features/admin/hud/OvieMacHud';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { OperationalControlPanel } from '@/components/features/admin/OperationalControlPanel';
import { getFounderFunnelData } from '@/lib/admin/founder-funnel';
import { getCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { authorizeHud } from '@/lib/auth/hud';
import { getHudMetrics } from '@/lib/hud/metrics';
import { getOvieMacHudSnapshot } from '@/lib/hud/ovie-mac-hud.server';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Now | Ovie',
  description: 'Company pulse, what matters, and whether you need to act.',
  robots: NOINDEX_ROBOTS,
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstString(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Canonical Ops screen: /hud.
 * Default /hud is rewritten into the OV app shell. Isolated chrome is only
 * ?fs=1 fullscreen, ?kiosk=TOKEN TV, or ?ovie=mac packaged Mac.
 */
export default async function HudPage({
  searchParams,
}: Readonly<{ readonly searchParams: Promise<SearchParams> }>) {
  const params = await searchParams;
  const kioskToken = firstString(params.kiosk);
  const fullscreen =
    firstString(params.fs) === '1' || firstString(params.mode) === 'kiosk';
  const macHud = firstString(params.ovie) === 'mac';

  const tokenAuth = kioskToken ? await authorizeHud(kioskToken) : null;
  const tokenOk = tokenAuth?.ok === true && tokenAuth.mode === 'kiosk';

  if (!tokenOk) {
    const adminAccess = await getCurrentAdminPageAccess();
    if (!adminAccess.isAuthenticated) unauthorized();
    if (!adminAccess.hasAdminRole) forbidden();
  }

  if (macHud && !tokenOk) {
    const snapshot = await getOvieMacHudSnapshot();
    return <OvieMacHud snapshot={snapshot} />;
  }

  const [metrics, funnel] = await Promise.all([
    getHudMetrics(tokenOk ? 'kiosk' : 'admin'),
    tokenOk
      ? Promise.resolve(null)
      : getFounderFunnelData('30d').catch(() => null),
  ]);
  const dashboard = (
    <OpsCockpitClient
      initialMetrics={metrics}
      density={tokenOk || fullscreen ? 'kiosk' : 'shell'}
      presentationMode={tokenOk ? 'token' : 'shell'}
      kioskToken={tokenOk ? kioskToken : null}
      initialFunnel={funnel}
    />
  );

  if (tokenOk || fullscreen) {
    return (
      <main className='hud-kiosk-viewport min-h-screen bg-page text-primary-token'>
        {fullscreen && !tokenOk ? (
          <div className='flex justify-end px-4 pt-4'>
            <HudFullscreenControl action='exit' />
          </div>
        ) : null}
        <div className='flex flex-col gap-3 p-4'>{dashboard}</div>
      </main>
    );
  }

  return (
    <AdminPage
      title='Now'
      description='How Jovie is doing now, what matters, and whether you need to act.'
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
