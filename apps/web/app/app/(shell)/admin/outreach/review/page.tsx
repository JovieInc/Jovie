import { redirect } from 'next/navigation';
import { buildAdminGrowthHref } from '@/constants/admin-navigation';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export default async function AdminOutreachReviewRedirectPage() {
  await requireCurrentAdminPageAccess();

  const params = new URLSearchParams();
  params.set('queue', 'review');
  redirect(buildAdminGrowthHref('outreach', params));
}
