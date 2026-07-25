import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildAdminGrowthHref } from '@/constants/admin-navigation';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export const metadata: Metadata = {
  title: 'Admin ingest',
};

export const runtime = 'nodejs';

export default async function AdminIngestRedirectPage() {
  await requireCurrentAdminPageAccess();

  redirect(buildAdminGrowthHref('ingest'));
}
