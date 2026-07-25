import { redirect } from 'next/navigation';
import { buildAdminGrowthHref } from '@/constants/admin-navigation';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export default async function AdminOutreachRedirectPage() {
  await requireCurrentAdminPageAccess();

  redirect(buildAdminGrowthHref('outreach'));
}
