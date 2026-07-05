import { Button } from '@jovie/ui';
import { Maximize2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden, redirect, unauthorized } from 'next/navigation';
import { HudDashboardClient } from '@/app/app/(shell)/admin/ops/HudDashboardClient';
import { HudShipperPanels } from '@/components/features/admin/hud/HudShipperPanels';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { env } from '@/lib/env-server';
import { getHudMetrics } from '@/lib/hud/metrics';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'HUD',
  description: 'Operator HUD: shipper status, KPIs, and live ops metrics.',
  robots: NOINDEX_ROBOTS,
};

type SearchParams = Record<string, string | string[] | undefined>;

const TV_VIEW_HREF = `${APP_ROUTES.HUD_TV}`;

/**
 * /hud — admin Ops HUD surface for the Ovie menu bar and operator bookmarks.
 *
 * Kiosk token bookmarks still redirect to /hud-tv. Authenticated admins get the
 * full ops dashboard (KPI grid + shipper panels). Non-admins receive 403.
 */
export default async function HudPage({
  searchParams,
}: Readonly<{ readonly searchParams: Promise<SearchParams> }>) {
  const params = await searchParams;
  const rawKiosk = params.kiosk;
  const kioskToken = typeof rawKiosk === 'string' ? rawKiosk : null;

  if (kioskToken) {
    redirect(`${APP_ROUTES.HUD_TV}?kiosk=${encodeURIComponent(kioskToken)}`);
  }

  const adminAccess = await getCurrentAdminPageAccess();
  if (!adminAccess.isAuthenticated) {
    unauthorized();
  }
  if (!adminAccess.hasAdminRole) {
    forbidden();
  }

  const metrics = await getHudMetrics('admin');

  return (
    <StandaloneProductPage width='xl' className='hud-admin-viewport'>
      <AdminPage
        title='HUD'
        description='Shipper status, in-flight ledger, what shipped, and live KPIs.'
        testId='hud-admin-page'
        actions={
          <Button asChild variant='secondary' size='sm'>
            <Link
              href={TV_VIEW_HREF}
              target='_blank'
              rel='noopener'
              aria-label='Open TV View In A New Tab'
            >
              <Maximize2 className='h-3.5 w-3.5' aria-hidden='true' />
              TV view
            </Link>
          </Button>
        }
      >
        <HudShipperPanels />
        <HudDashboardClient
          initialMetrics={metrics}
          density='shell'
          presentationMode='shell'
          useFixtureAgentRuns={env.HUD_AGENT_RUNS_FIXTURES === '1'}
        />
      </AdminPage>
    </StandaloneProductPage>
  );
}
