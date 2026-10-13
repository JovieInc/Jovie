import type { Metadata } from 'next';
import { OvieListWorkspace } from '@/components/features/admin/lists/OvieListWorkspace';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'List',
  description: 'Creator list with ratings, favorites and Jovie suggestions.',
  robots: NOINDEX_ROBOTS,
};

/**
 * /app/ov/lists/[id]: one founder list. Rows load client-side from
 * GET /api/admin/ov-lists/[id] so decisions update in place.
 */
export default async function AdminListPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requireCurrentAdminPageAccess();
  const { id } = await params;
  return <OvieListWorkspace listId={id} />;
}
