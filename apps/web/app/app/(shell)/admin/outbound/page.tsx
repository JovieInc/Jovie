import type { Metadata } from 'next';
import { OutboundWorkspace } from '@/components/features/admin/outbound/OutboundWorkspace';
import { APP_ROUTES } from '@/constants/routes';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { getSidebarRouteLabel } from '@/lib/constants/sidebar-route-labels';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: getSidebarRouteLabel(APP_ROUTES.ADMIN_OUTBOUND, 'ov'),
  description: 'Certify potential outbound artists and approve every message.',
  robots: NOINDEX_ROBOTS,
};

/**
 * /app/ov/outbound — Tim reviews potential outbound artists, certifies their
 * facts, and approves each target and message revision. Nothing sends from
 * here; the send paths refuse anything not approved at the exact revision.
 */
export default async function AdminOutboundPage() {
  await requireCurrentAdminPageAccess();

  return <OutboundWorkspace />;
}
