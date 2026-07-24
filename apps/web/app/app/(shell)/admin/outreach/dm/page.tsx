import { redirect } from 'next/navigation';
import { buildAdminGrowthHref } from '@/constants/admin-navigation';

export default function AdminOutreachDmRedirectPage() {
  const params = new URLSearchParams();
  params.set('queue', 'dm');
  redirect(buildAdminGrowthHref('outreach', params));
}
