import { Button } from '@jovie/ui';
import { CheckCircle2, Maximize2, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type {
  DailyBucket,
  ShippingVelocityResponse,
} from '@/app/api/admin/hud/shipping-velocity/route';
import { AdminToolPage } from '@/components/features/admin/layout/AdminToolPage';
import { APP_ROUTES } from '@/constants/routes';
import { getPublicProfileCanaryStatus } from '@/lib/admin/ops-queries';
import { env } from '@/lib/env-server';
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
    // Best-effort server prefetch for deployed admin views. In local dev,
    // Next may choose a fallback port, and RSC has no reliable request origin
    // here; the client chart fetch is the source of truth in that case.
    if (!env.VERCEL_URL) return null;

    const base = `https://${env.VERCEL_URL}`;

    const response = await fetch(
      `${base}/api/admin/hud/shipping-velocity?range=7d`,
      {
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
  const [metrics, shippingPrefetch, canaryStatus] = await Promise.all([
    getHudMetrics('admin'),
    getInitialShippingData(),
    getPublicProfileCanaryStatus(),
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

  // Derive canary display state
  const canaryPass = canaryStatus?.pass ?? null;
  const canaryRunAt = canaryStatus?.runAt
    ? new Date(canaryStatus.runAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short',
      })
    : null;

  return (
    <AdminToolPage
      title='Ops'
      description='Live operations: deploys, AI ops, runway, blockers.'
      testId='admin-ops-page'
      actions={
        <Button asChild variant='secondary' size='sm'>
          <Link
            href={PRESENTATION_VIEW_HREF}
            target='_blank'
            rel='noopener'
            aria-label='Open TV view in a new tab'
          >
            <Maximize2 className='h-3.5 w-3.5' aria-hidden='true' />
            TV view
          </Link>
        </Button>
      }
    >
      {/* Public-profile canary status (JOV-1872) — one line + status dot */}
      <div
        className='flex items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-2 text-[13px]'
        data-testid='public-profile-canary-status'
      >
        {canaryPass === null ? (
          <span
            className='h-2 w-2 rounded-full bg-tertiary-token'
            aria-hidden='true'
          />
        ) : canaryPass ? (
          <CheckCircle2
            className='h-3.5 w-3.5 shrink-0 text-success'
            aria-label='Pass'
          />
        ) : (
          <XCircle
            className='h-3.5 w-3.5 shrink-0 text-destructive'
            aria-label='Fail'
          />
        )}
        <span className='font-medium text-secondary-token'>
          Public profile canary
        </span>
        <span className='text-tertiary-token'>
          {canaryPass === null
            ? 'No data yet'
            : canaryPass
              ? 'Pass'
              : `Fail — ${canaryStatus?.checks
                  .filter(c => !c.ok)
                  .map(c => c.name)
                  .join(', ')}`}
        </span>
        {canaryRunAt ? (
          <span className='ml-auto text-[12px] text-tertiary-token'>
            {canaryRunAt}
          </span>
        ) : null}
      </div>

      <HudDashboardClient
        initialMetrics={metrics}
        density='shell'
        presentationMode='shell'
        initialShippingData={shippingPrefetch?.data}
        initialShippingCachedAt={shippingPrefetch?.cachedAt}
      />
    </AdminToolPage>
  );
}
