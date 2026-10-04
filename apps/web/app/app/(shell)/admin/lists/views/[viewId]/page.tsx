import type { Metadata } from 'next';
import { OvieSmartViewWorkspace } from '@/components/features/admin/lists/OvieSmartViewWorkspace';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Smart view',
  description: 'Saved filter across every founder list.',
  robots: NOINDEX_ROBOTS,
};

/** /app/ov/lists/views/[viewId]: one smart view across every list. */
export default async function AdminSmartViewPage({
  params,
}: {
  readonly params: Promise<{ viewId: string }>;
}) {
  await requireCurrentAdminPageAccess();
  const { viewId } = await params;
  return <OvieSmartViewWorkspace viewId={viewId} />;
}
