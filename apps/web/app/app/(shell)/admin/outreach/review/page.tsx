import { redirect } from 'next/navigation';
import { buildAdminGrowthHref } from '@/constants/admin-navigation';

export default function AdminOutreachReviewRedirectPage() {
  const params = new URLSearchParams();
  params.set('queue', 'review');
  redirect(buildAdminGrowthHref('outreach', params));
}
