import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildAdminGrowthHref } from '@/constants/admin-navigation';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export const metadata: Metadata = {
  title: 'Invite Campaigns - Admin',
};

export const runtime = 'nodejs';

export default async function AdminCampaignsRedirectPage() {
  await requireCurrentAdminPageAccess();

  redirect(buildAdminGrowthHref('campaigns'));
}
