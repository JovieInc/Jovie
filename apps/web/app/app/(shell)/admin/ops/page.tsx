import { Maximize2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminToolPage } from '@/components/features/admin/layout/AdminToolPage';
import { APP_ROUTES } from '@/constants/routes';
import { getHudMetrics } from '@/lib/hud/metrics';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
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
export default async function AdminOpsPage({
  searchParams,
}: Readonly<{ readonly searchParams: Promise<SearchParams> }>) {
  const params = await searchParams;
  const presentationMode = resolvePresentationMode(params.mode);

  // The admin layout has already verified admin entitlement; getHudMetrics
  // accepts the access mode for downstream auth-aware features (e.g. AI ops
  // dispatch UI). Admin sees full dispatch; kiosk-token would not.
  const metrics = await getHudMetrics('admin');

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
          aria-label='Open presentation view in a new tab'
          className='inline-flex h-8 items-center gap-1.5 rounded-lg border border-subtle bg-surface-0 px-2.5 text-[12px] font-[540] text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token'
        >
          <Maximize2 className='h-3.5 w-3.5' aria-hidden='true' />
          Presentation view
        </Link>
      }
    >
      <HudDashboardClient
        initialMetrics={metrics}
        density='shell'
        presentationMode='shell'
      />
    </AdminToolPage>
  );
}
