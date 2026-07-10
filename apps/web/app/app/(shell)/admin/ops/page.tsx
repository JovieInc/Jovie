import { Button } from '@jovie/ui';
import { CheckCircle2, Maximize2, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type {
  DailyBucket,
  ShippingVelocityResponse,
} from '@/app/api/admin/hud/shipping-velocity/route';
import { HudShipperPanels } from '@/components/features/admin/hud/HudShipperPanels';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { OperationalControlPanel } from '@/components/features/admin/OperationalControlPanel';
import { APP_ROUTES } from '@/constants/routes';
import {
  getAuthSignupOnboardingCanaryStatus,
  getNightlyTestingAgentStatus,
  getPublicProfileCanaryStatus,
} from '@/lib/admin/ops-queries';
import type { CanaryReport } from '@/lib/canaries/public-profile';
import { env } from '@/lib/env-server';
import { getHudMetrics } from '@/lib/hud/metrics';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import {
  formatNightlyAgentSummary,
  NIGHTLY_AGENT_REPORT_DOC_PATH,
} from '@/lib/testing/nightly-agent-report';
import { logger } from '@/lib/utils/logger';
import { HudDashboardClient } from './HudDashboardClient';
import { ReleaseToRevenueGmvPanel } from './ReleaseToRevenueGmvPanel';

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

function formatCanaryRunAt(runAt: string | undefined): string | null {
  if (!runAt) return null;
  return new Date(runAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

function CanaryStatusRow({
  label,
  status,
  testId,
}: Readonly<{
  label: string;
  status: CanaryReport | null;
  testId: string;
}>) {
  const pass = status?.pass ?? null;
  const runAt = formatCanaryRunAt(status?.runAt);

  return (
    <div
      className='flex items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-2 text-app'
      data-testid={testId}
    >
      {pass === null ? (
        <span
          className='h-2 w-2 rounded-full bg-tertiary-token'
          aria-hidden='true'
        />
      ) : pass ? (
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
      <span className='font-medium text-secondary-token'>{label}</span>
      <span className='text-tertiary-token'>
        {pass === null
          ? 'No data yet'
          : pass
            ? 'Pass'
            : `Fail — ${status?.checks
                .filter(check => !check.ok)
                .map(check => check.name)
                .join(', ')}`}
      </span>
      {runAt ? (
        <span className='ml-auto text-xs text-tertiary-token'>{runAt}</span>
      ) : null}
    </div>
  );
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
  const [
    metrics,
    shippingPrefetch,
    publicProfileCanaryStatus,
    authCanaryStatus,
    nightlyAgentStatus,
  ] = await Promise.all([
    getHudMetrics('admin'),
    getInitialShippingData(),
    getPublicProfileCanaryStatus(),
    getAuthSignupOnboardingCanaryStatus(),
    getNightlyTestingAgentStatus(),
  ]);

  // In admin-kiosk presentation, render the kiosk-density body inside the
  // shell so admins keep their navigation. The full standalone TV experience
  // is at /hud-tv.
  if (presentationMode === 'admin-kiosk') {
    return (
      <div className='-mx-(--linear-app-content-padding-x) -my-(--linear-app-content-padding-y)'>
        <HudShipperPanels />
        <HudDashboardClient
          initialMetrics={metrics}
          density='kiosk'
          presentationMode='admin-kiosk'
          initialShippingData={shippingPrefetch?.data}
          initialShippingCachedAt={shippingPrefetch?.cachedAt}
          useFixtureAgentRuns={env.HUD_AGENT_RUNS_FIXTURES === '1'}
        />
      </div>
    );
  }

  const nightlyAgentPass = nightlyAgentStatus?.pass ?? null;
  const nightlyAgentRunAt = nightlyAgentStatus?.generatedAt
    ? new Date(nightlyAgentStatus.generatedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short',
      })
    : null;
  const nightlyAgentSummary = nightlyAgentStatus
    ? formatNightlyAgentSummary(nightlyAgentStatus)
    : null;
  return (
    <AdminPage
      title='Ops'
      description='Live operations: deploys, AI ops, runway, blockers.'
      testId='admin-ops-page'
      actions={
        <Button asChild variant='secondary' size='sm'>
          <Link
            href={PRESENTATION_VIEW_HREF}
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
      <div className='flex flex-col gap-2'>
        <CanaryStatusRow
          label='Public Profile Canary'
          status={publicProfileCanaryStatus}
          testId='public-profile-canary-status'
        />
        <CanaryStatusRow
          label='Auth Signup Onboarding Canary'
          status={authCanaryStatus}
          testId='auth-signup-onboarding-canary-status'
        />
      </div>

      {/* Nightly testing agent status (JOV-1870) */}
      <div
        className='flex flex-wrap items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-2 text-app'
        data-testid='nightly-testing-agent-status'
      >
        {nightlyAgentPass === null ? (
          <span
            className='h-2 w-2 rounded-full bg-tertiary-token'
            aria-hidden='true'
          />
        ) : nightlyAgentPass ? (
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
          Nightly testing agent
        </span>
        <span className='text-tertiary-token'>
          {nightlyAgentPass === null ? 'No data yet' : nightlyAgentSummary}
        </span>
        {nightlyAgentStatus?.workflowRunUrl ? (
          <Link
            href={nightlyAgentStatus.workflowRunUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='text-xs text-secondary-token underline-offset-2 hover:underline'
          >
            Last run
          </Link>
        ) : null}
        <Link
          href={`https://github.com/JovieInc/Jovie/blob/main/${NIGHTLY_AGENT_REPORT_DOC_PATH}`}
          target='_blank'
          rel='noopener noreferrer'
          className='text-xs text-secondary-token underline-offset-2 hover:underline'
        >
          Daily report
        </Link>
        {nightlyAgentRunAt ? (
          <span className='ml-auto text-xs text-tertiary-token'>
            {nightlyAgentRunAt}
          </span>
        ) : null}
      </div>

      <OperationalControlPanel />

      <ReleaseToRevenueGmvPanel />

      <HudShipperPanels />

      <HudDashboardClient
        initialMetrics={metrics}
        density='shell'
        presentationMode='shell'
        initialShippingData={shippingPrefetch?.data}
        initialShippingCachedAt={shippingPrefetch?.cachedAt}
        useFixtureAgentRuns={env.HUD_AGENT_RUNS_FIXTURES === '1'}
      />
    </AdminPage>
  );
}
