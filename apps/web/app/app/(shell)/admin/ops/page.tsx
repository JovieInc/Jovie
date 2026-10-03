import type { Metadata } from 'next';
import { HudDashboardClient } from '@/app/app/(shell)/admin/ops/HudDashboardClient';
import { HudFullscreenControl } from '@/components/features/admin/hud/HudFullscreenControl';
import { HudNoiseDisclosure } from '@/components/features/admin/hud/HudNoiseDisclosure';
import { OvieMacHud } from '@/components/features/admin/hud/OvieMacHud';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { OperationalControlPanel } from '@/components/features/admin/OperationalControlPanel';
import { getFounderFunnelData } from '@/lib/admin/founder-funnel';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { env } from '@/lib/env-server';
import { getHudMetrics } from '@/lib/hud/metrics';
import { getOvieMacHudSnapshot } from '@/lib/hud/ovie-mac-hud.server';
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
 * Authenticated Ops is a route inside the shared app shell. `fs=1` changes
 * only the shell presentation; it never creates a second route or window.
 */
export default async function AdminOpsPage({
  searchParams,
}: Readonly<{ readonly searchParams: Promise<SearchParams> }>) {
  await requireCurrentAdminPageAccess();

  const params = await searchParams;
  const fullscreen =
    firstString(params.fs) === '1' || firstString(params.mode) === 'kiosk';
  const macHud = firstString(params.ovie) === 'mac';

  if (macHud) {
    const snapshot = await getOvieMacHudSnapshot();
    return <OvieMacHud snapshot={snapshot} fullscreen={fullscreen} />;
  }

  const [metrics, funnel] = await Promise.all([
    getHudMetrics('admin'),
    getFounderFunnelData('30d').catch(() => null),
  ]);

  return (
    <AdminPage
      title={OVIE_OPS_PRODUCT_NAME}
      description='Decisions, survival, bottleneck, delivery, operating chain.'
      testId='hud-admin-page'
      actions={<HudFullscreenControl fullscreen={fullscreen} />}
    >
      <HudDashboardClient
        initialMetrics={metrics}
        density={fullscreen ? 'kiosk' : 'shell'}
        presentationMode='shell'
        kioskToken={null}
        useFixtureAgentRuns={env.HUD_AGENT_RUNS_FIXTURES === '1'}
        initialFunnel={funnel}
      />
      <HudNoiseDisclosure id='developer-controls' label='Developer Controls'>
        <OperationalControlPanel />
      </HudNoiseDisclosure>
    </AdminPage>
  );
}
