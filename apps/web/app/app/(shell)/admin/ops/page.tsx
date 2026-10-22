import HudPage, { metadata } from '@/app/hud/page';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export { metadata };

// Next.js route-segment config must be a local literal.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /app/ov/ops — the full operations dashboard (cash, funnel, health,
 * deployments, developer controls). Home at /app/ov is the daily surface;
 * this is its drill-down. Kiosk and `?fs=1` stay on the isolated /hud page.
 */
export default async function AdminOpsPage({
  searchParams,
}: Readonly<{
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  await requireCurrentAdminPageAccess();
  return HudPage({ searchParams });
}
