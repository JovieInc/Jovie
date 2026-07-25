import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildAdminGrowthHref } from '@/constants/admin-navigation';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export const metadata: Metadata = {
  title: 'Leads | Admin',
};

export const runtime = 'nodejs';

export default async function AdminLeadsRedirectPage() {
  await requireCurrentAdminPageAccess();

  redirect(buildAdminGrowthHref('leads'));
}
