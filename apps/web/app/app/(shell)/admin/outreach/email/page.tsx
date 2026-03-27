import { redirect } from 'next/navigation';
import { buildAdminGrowthHref } from '@/constants/admin-navigation';

export default function AdminOutreachEmailRedirectPage() {
  const params = new URLSearchParams();
  params.set('queue', 'email');
  redirect(buildAdminGrowthHref('outreach', params));
}
