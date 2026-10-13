import type { Metadata } from 'next';
import { OvieListsIndex } from '@/components/features/admin/lists/OvieListsIndex';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Lists',
  description: 'Founder creator lists and smart views.',
  robots: NOINDEX_ROBOTS,
};

/** /app/ov/lists: every list and non-empty smart view. Ovie only. */
export default async function AdminListsPage() {
  await requireCurrentAdminPageAccess();
  return <OvieListsIndex />;
}
