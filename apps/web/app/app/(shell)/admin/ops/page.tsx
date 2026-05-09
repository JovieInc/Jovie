import { Maximize2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type {
  DailyBucket,
  ShippingVelocityResponse,
} from '@/app/api/admin/hud/shipping-velocity/route';
import { AgentOsRunsPanel } from '@/components/features/admin/agent-os';
import { AdminToolPage } from '@/components/features/admin/layout/AdminToolPage';
import { APP_ROUTES } from '@/constants/routes';
import { AGENT_OS_ADMIN_FIXTURE_ARTIFACTS } from '@/lib/agent-os/fixtures';
import { getHudMetrics } from '@/lib/hud/metrics';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import { logger } from '@/lib/utils/logger';
import { HudDashboardClient } from './HudDashboardClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Ops',
  description: 'Live operations: deploys, AI ops, runway, blockers.',
  robots: NOINDEX_ROBOTS,
};

type SearchParams = Record<string, string | string[] | undefined>;
type PresentationMode = 'shell' | 'admin-kiosk';

const PRESENTATION_VIEW_HREF = `${APP_ROUTES.ADMIN_OPS}?mode=kiosk`;

function resolvePresentationMode(value: unknown): PresentationMode {
  return value === 'kiosk' ? 'admin-kiosk' : 'shell';
}

/**
 * /app/admin/ops — admin Ops surface.
 *
 * Admin auth is enforced by `apps/web/app/app/(shell)/admin/layout.tsx`.
 * This page resolves the presentation mode (shell-default or admin-kiosk),
 * fetches metrics, and renders the shared HudDashboardClient.
 *
 * The token-only TV/wallboard rendering lives at /hud-tv and is a separate
 * route by design — keeping admin and token paths in different files
 * prevents an invalid kiosk URL from silently escalating to admin-rendered
 * content.
 */
async function getInitialShippingData(): Promise<{
  data: DailyBucket[];
  cachedAt: string;
} | null> {
  try {
    // Import the route handler logic directly to avoid an extra HTTP round-trip.
    // We call getRedis + GitHub logic via the same module but need to bypass
    // the auth check since we are already in an authenticated admin server component.
    // Instead, use a relative internal fetch to keep concerns separate and avoid
    // coupling the page to route internals. Timeout is generous (5s) since
    // this is a best-effort server prefetch — the client will refetch on failure.
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const response = await fetch(
      `${base}/api/admin/hud/shipping-velocity?range=7d`,
      {
        headers: {
          // Internal server-to-server call — pass a sentinel to indicate
          // this is an SSR prefetch so the route doesn't reject for missing
          // auth cookies. The admin layout already enforced auth.
          // We use a lightweight approach: simply forward cookies from a
          // different path is not possible in RSC without next/headers.
          // Accept fallback: the component will client-fetch if this returns null.
        },
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      }
    );

    if (!response.ok) return null;
    const result = (await response.json()) as ShippingVelocityResponse;
    return { data: result.data, cachedAt: result.cachedAt };
  } catch (err) {
    logger.error('[admin/ops] Failed to prefetch shipping velocity', err);
    return null;
  }
}

export default async function AdminOpsPage({
  searchParams,
}: Readonly<{ readonly searchParams: Promise<SearchParams> }>) {
  const params = await searchParams;
  const presentationMode = resolvePresentationMode(params.mode);

  // The admin layout has already verified admin entitlement; getHudMetrics
  // accepts the access mode for downstream auth-aware features (e.g. AI ops
  // dispatch UI). Admin sees full dispatch; kiosk-token would not.
  const [metrics, shippingPrefetch] = await Promise.all([
    getHudMetrics('admin'),
    getInitialShippingData(),
  ]);

  // In admin-kiosk presentation, render the kiosk-density body inside the
  // shell so admins keep their navigation. The full standalone TV experience
  // is at /hud-tv.
  if (presentationMode === 'admin-kiosk') {
    return (
      <div className='-mx-(--linear-app-content-padding-x) -my-(--linear-app-content-padding-y)'>
        <HudDashboardClient
          initialMetrics={metrics}
          density='kiosk'
          presentationMode='admin-kiosk'
          initialShippingData={shippingPrefetch?.data}
          initialShippingCachedAt={shippingPrefetch?.cachedAt}
        />
      </div>
    );
  }

  return (
    <AdminToolPage
      title='Ops'
      description='Live operations: deploys, AI ops, runway, blockers.'
      testId='admin-ops-page'
      actions={
        <Link
          href={PRESENTATION_VIEW_HREF}
          target='_blank'
          rel='noopener'
          aria-label='Open TV view in a new tab'
          className='inline-flex h-8 items-center gap-1.5 rounded-lg border border-subtle bg-surface-0 px-2.5 text-[12px] font-[540] text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token'
        >
          <Maximize2 className='h-3.5 w-3.5' aria-hidden='true' />
          TV view
        </Link>
      }
    >
      <HudDashboardClient
        initialMetrics={metrics}
        density='shell'
        presentationMode='shell'
        initialShippingData={shippingPrefetch?.data}
        initialShippingCachedAt={shippingPrefetch?.cachedAt}
      />
      <AgentOsRunsPanel artifacts={AGENT_OS_ADMIN_FIXTURE_ARTIFACTS} />
    </AdminToolPage>
  );
}
